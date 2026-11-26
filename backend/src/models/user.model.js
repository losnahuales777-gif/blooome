import { collection, DuplicateKeyError, isDuplicateKey, nextId, paging, withSession } from '../config/database.js';
import { RoleModel } from './role.model.js';

// Capa MODEL: acceso a datos en MongoDB.
// Prevencion de inyeccion NoSQL (equivalente a la inyeccion SQL): los valores llegan ya validados por
// zod (tipos primitivos, nunca objetos) y los filtros usan $eq explicito, asi un valor como
// { "$ne": null } jamas se interpreta como operador.
const users = () => collection('users');
const WITHOUT_HASH = { projection: { passwordHash: 0 } };

// Devuelve la misma forma que consume la capa Business (independiente del motor de datos).
async function toRow(doc) {
  if (!doc) return null;
  const role = await RoleModel.findById(doc.roleId);
  return {
    id: doc._id,
    email: doc.email,
    full_name: doc.fullName,
    password_hash: doc.passwordHash,
    is_active: doc.isActive ? 1 : 0,
    failed_attempts: doc.failedAttempts ?? 0,
    locked_until: doc.lockedUntil ?? null,
    last_login_at: doc.lastLoginAt ?? null,
    created_at: doc.createdAt,
    role_id: doc.roleId,
    role: role?.code,
    role_name: role?.name,
    role_level: role?.level,
    role_family: role?.family,
    role_active: role?.active !== false,
    patient_id: doc.patientId ?? null,
    deleted_at: doc.deletedAt ?? null,
  };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOT_DELETED = { deletedAt: null };

export const UserModel = {
  async findByEmail(email) {
    return toRow(await users().findOne({ email: { $eq: email } }));
  },

  async findById(id, session) {
    return toRow(await users().findOne({ _id: { $eq: id } }, { ...WITHOUT_HASH, ...withSession(session) }));
  },

  async findActiveById(id) {
    return toRow(await users().findOne({ _id: { $eq: id }, isActive: true, ...NOT_DELETED }, WITHOUT_HASH));
  },

  // Solo devuelve usuarios cuyo nivel de rol sea <= maxLevel (visibilidad jerarquica). Busca por nombre,
  // correo o identificador; las cuentas eliminadas (baja logica) no se listan.
  async list({ maxLevel, page, pageSize, q, role }) {
    const roleIds = await RoleModel.idsUpToLevel(maxLevel);
    const filter = { ...NOT_DELETED, roleId: { $in: role ? roleIds.filter((r) => r === role) : roleIds } };
    if (q) {
      const term = escapeRegex(q.trim().slice(0, 80));
      filter.$or = [{ fullName: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }];
      if (/^\d{1,9}$/.test(q.trim())) filter.$or.push({ _id: Number(q.trim()) });
    }
    const [docs, total] = await Promise.all([
      users().find(filter, WITHOUT_HASH).sort({ createdAt: -1 }).skip(paging({ page, pageSize }).skip).limit(pageSize).toArray(),
      users().countDocuments(filter),
    ]);
    return { items: await Promise.all(docs.map(toRow)), total };
  },

  async create({ email, fullName, passwordHash, roleId, createdBy, patientId = null, isActive = true }) {
    const id = await nextId('users');
    const now = new Date();
    try {
      await users().insertOne({
        _id: id,
        email,
        fullName,
        passwordHash,
        roleId,
        patientId,
        isActive,
        deletedAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdBy: createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateKeyError('Ese correo ya esta registrado');
      throw err;
    }
    return id;
  },

  async updateProfile(id, { fullName }) {
    await users().updateOne({ _id: { $eq: id } }, { $set: { fullName, updatedAt: new Date() } });
  },

  async setActive(id, isActive, session) {
    await users().updateOne({ _id: { $eq: id } }, { $set: { isActive: Boolean(isActive), updatedAt: new Date() } }, withSession(session));
  },

  async setRole(id, roleId) {
    await users().updateOne({ _id: { $eq: id } }, { $set: { roleId, updatedAt: new Date() } });
  },

  async countActiveByRole(roleCode) {
    const role = await RoleModel.findByCode(roleCode);
    return role ? users().countDocuments({ roleId: role.id, isActive: true, ...NOT_DELETED }) : 0;
  },

  async countByRole() {
    return users()
      .aggregate([
        { $match: NOT_DELETED },
        { $group: { _id: '$roleId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
      ])
      .toArray();
  },

  async findByPatientId(patientId) {
    return toRow(await users().findOne({ patientId: { $eq: patientId }, ...NOT_DELETED }, WITHOUT_HASH));
  },

  // Baja logica: la cuenta deja de existir para el sistema, pero se conserva para la auditoria.
  // El correo se libera (se mueve a deletedEmail) para poder registrarlo de nuevo.
  async softDelete(id, by) {
    const doc = await users().findOne({ _id: { $eq: id } }, { projection: { email: 1, patientId: 1 } });
    await users().updateOne(
      { _id: { $eq: id } },
      {
        $set: {
          isActive: false,
          deletedAt: new Date(),
          deletedBy: by,
          deletedEmail: doc?.email ?? null,
          email: `eliminado-${id}@bloome.invalid`,
          passwordHash: null,
          oneTimeCode: null,
          patientId: null,
          deletedPatientId: doc?.patientId ?? null,
          updatedAt: new Date(),
        },
      },
    );
  },

  // Codigo de un solo uso (invitacion o restablecimiento): solo se guarda su hash.
  // clearPassword: en un restablecimiento la contrasena anterior deja de servir de inmediato.
  async setOneTimeCode(id, { codeHash, purpose, expiresAt, clearPassword = false }) {
    await users().updateOne(
      { _id: { $eq: id } },
      {
        $set: {
          oneTimeCode: { codeHash, purpose, expiresAt, attempts: 0 },
          ...(clearPassword && { passwordHash: null }),
          updatedAt: new Date(),
        },
      },
    );
  },

  async findForCode(email) {
    return users().findOne(
      { email: { $eq: email }, ...NOT_DELETED, oneTimeCode: { $ne: null } },
      { projection: { oneTimeCode: 1, isActive: 1 } },
    );
  },

  async registerCodeAttempt(id) {
    await users().updateOne({ _id: { $eq: id } }, { $inc: { 'oneTimeCode.attempts': 1 } });
  },

  // Consume el codigo y fija la contrasena en una sola operacion atomica.
  async completeCode(id, codeHash, passwordHash) {
    const r = await users().updateOne(
      { _id: { $eq: id }, 'oneTimeCode.codeHash': { $eq: codeHash } },
      { $set: { passwordHash, isActive: true, oneTimeCode: null, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() } },
    );
    return r.modifiedCount === 1;
  },

  // Actualizacion atomica en el servidor: incrementa el contador y, si llega al maximo, bloquea.
  async registerFailedAttempt(id, maxAttempts, lockMinutes) {
    await users().updateOne({ _id: { $eq: id } }, [
      { $set: { failedAttempts: { $add: [{ $ifNull: ['$failedAttempts', 0] }, 1] } } },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: ['$failedAttempts', maxAttempts] },
              { $dateAdd: { startDate: '$$NOW', unit: 'minute', amount: lockMinutes } },
              '$lockedUntil',
            ],
          },
        },
      },
    ]);
  },

  async registerSuccessfulLogin(id) {
    await users().updateOne({ _id: { $eq: id } }, { $set: { failedAttempts: 0, lockedUntil: null }, $currentDate: { lastLoginAt: true } });
  },

  async findPasswordHash(id) {
    const doc = await users().findOne({ _id: { $eq: id }, isActive: true, ...NOT_DELETED }, { projection: { passwordHash: 1 } });
    return doc?.passwordHash ?? null;
  },

  async setPassword(id, passwordHash) {
    await users().updateOne({ _id: { $eq: id } }, { $set: { passwordHash, updatedAt: new Date() } });
  },
};
