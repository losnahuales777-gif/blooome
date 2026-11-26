import { collection } from '../config/database.js';

// Roles: catalogo en la coleccion "roles" (sistema + personalizados). Id/codigo/nivel/estado se guardan en
// memoria y la cache se invalida cuando el superusuario crea o edita un rol. Los permisos de cada rol NO se
// cachean: se leen siempre de la base (ver PermissionModel), asi una revocacion aplica al instante.
let cache = null;

async function load() {
  if (!cache) {
    const docs = await collection('roles')
      .find({}, { projection: { permissions: 0 } })
      .sort({ level: -1, _id: 1 })
      .toArray();
    cache = docs.map((r) => ({
      id: r._id,
      code: r.code,
      name: r.name,
      description: r.description ?? '',
      level: r.level,
      family: r.family ?? 'personalizado',
      system: Boolean(r.system),
      active: r.active !== false,
      createdAt: r.createdAt ?? null,
    }));
  }
  return cache;
}

export const RoleModel = {
  invalidate() {
    cache = null;
  },

  async list() {
    return load();
  },

  async findByCode(code) {
    return (await load()).find((r) => r.code === code) ?? null;
  },

  async findById(id) {
    return (await load()).find((r) => r.id === id) ?? null;
  },

  async idsUpToLevel(maxLevel) {
    return (await load()).filter((r) => r.level <= maxLevel).map((r) => r.id);
  },

  async create({ id, code, name, description, level, family, permissions, createdBy }) {
    await collection('roles').insertOne({
      _id: id,
      code,
      name,
      description,
      level,
      family,
      permissions,
      system: false,
      active: true,
      createdBy,
      createdAt: new Date(),
    });
    this.invalidate();
  },

  async update(id, changes) {
    await collection('roles').updateOne({ _id: { $eq: id } }, { $set: { ...changes, updatedAt: new Date() } });
    this.invalidate();
  },
};
