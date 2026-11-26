import { collection, withSession } from '../config/database.js';

// Permisos: catalogo en "permissions" (_id = codigo), permisos por rol en roles.permissions y
// permisos directos por usuario en "userPermissions" (indice unico usuario + permiso).
const permissions = () => collection('permissions');
const userPermissions = () => collection('userPermissions');

export const PermissionModel = {
  async list() {
    const docs = await permissions().find().sort({ _id: 1 }).toArray();
    return docs.map((p) => ({
      id: p._id,
      code: p._id,
      description: p.description,
      module: p.module ?? 'general',
      action: p.action ?? 'ver',
      clinical: Boolean(p.clinical),
      is_delegable: p.isDelegable ? 1 : 0,
    }));
  },

  async allCodes() {
    return (
      await permissions()
        .find({}, { projection: { _id: 1 } })
        .toArray()
    ).map((p) => p._id);
  },

  // Permisos efectivos = permisos del rol (si el rol esta activo) + permisos directos vigentes.
  async effectiveCodes(userId) {
    const user = await collection('users').findOne({ _id: { $eq: userId } }, { projection: { roleId: 1 } });
    if (!user) return [];
    const [roleCodes, directCodes] = await Promise.all([this.roleCodes(user.roleId, { activeOnly: true }), this.directCodes(userId)]);
    return [...new Set([...roleCodes, ...directCodes])];
  },

  async roleCodes(roleId, { activeOnly = false } = {}) {
    const role = await collection('roles').findOne({ _id: { $eq: roleId } }, { projection: { permissions: 1, active: 1 } });
    if (!role || (activeOnly && role.active === false)) return [];
    return role.permissions ?? [];
  },

  async setRolePermissions(roleId, codes) {
    await collection('roles').updateOne({ _id: { $eq: roleId } }, { $set: { permissions: codes, updatedAt: new Date() } });
  },

  // Permisos directos vigentes: los temporales dejan de contar al vencer (sin tareas programadas).
  async directCodes(userId, session) {
    const docs = await userPermissions()
      .find(
        { userId: { $eq: userId }, $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
        { projection: { permissionId: 1 }, ...withSession(session) },
      )
      .toArray();
    return docs.map((d) => d.permissionId);
  },

  async directGrants(userId) {
    return userPermissions()
      .find({ userId: { $eq: userId } })
      .sort({ grantedAt: -1 })
      .toArray();
  },

  // Permiso directo temporal y justificado (p. ej. acceso clinico de emergencia para Sistemas).
  async grantTemporary(userId, { permissionId, grantedBy, justification, expiresAt }, session) {
    await userPermissions().updateOne(
      { userId, permissionId },
      { $set: { grantedBy, grantedAt: new Date(), justification, expiresAt } },
      { upsert: true, ...withSession(session) },
    );
  },

  async findDelegableByCodes(codes) {
    if (codes.length === 0) return [];
    const docs = await permissions()
      .find({ _id: { $in: codes }, isDelegable: true })
      .toArray();
    return docs.map((p) => ({ id: p._id, code: p._id, clinical: Boolean(p.clinical) }));
  },

  // Reemplaza los permisos directos permanentes; los temporales (con vencimiento) se conservan.
  async replaceDirect(userId, permissionIds, grantedBy, session) {
    await userPermissions().deleteMany(
      { userId: { $eq: userId }, $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }] },
      withSession(session),
    );
    await this.addDirect(userId, permissionIds, grantedBy, session);
  },

  // Upsert por permiso: idempotente, no falla si el usuario ya lo tenia.
  async addDirect(userId, permissionIds, grantedBy, session) {
    if (permissionIds.length === 0) return;
    await userPermissions().bulkWrite(
      permissionIds.map((permissionId) => ({
        updateOne: {
          filter: { userId, permissionId },
          update: { $setOnInsert: { grantedBy, grantedAt: new Date() } },
          upsert: true,
        },
      })),
      withSession(session),
    );
  },

  async directIds(userId, session) {
    return this.directCodes(userId, session);
  },
};
