import { randomBytes } from 'node:crypto';
import { collection } from '../config/database.js';

// Sesiones en el servidor (etapa 6). El JWT lleva el identificador de sesion (sid); cada peticion
// comprueba que la sesion exista, no este revocada y no haya superado el tiempo de inactividad.
// Asi cerrar sesion invalida el token de verdad, y se pueden cerrar sesiones de otros dispositivos.
const sessions = () => collection('sesiones');
const PURGE_AFTER_DAYS = 90;

export const SessionModel = {
  async create({ userId, ip, userAgent, ttlMinutes }) {
    const now = new Date();
    const _id = randomBytes(24).toString('hex');
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60000);
    await sessions().insertOne({
      _id,
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ip: ip?.slice(0, 45) ?? null,
      userAgent: userAgent?.slice(0, 200) ?? null,
      revokedAt: null,
      revokedReason: null,
      // Los registros se purgan automaticamente (indice TTL) tiempo despues de caducar.
      purgeAt: new Date(expiresAt.getTime() + PURGE_AFTER_DAYS * 86400000),
    });
    return { sid: _id, expiresAt };
  },

  async findActive(sid) {
    if (typeof sid !== 'string' || !/^[a-f0-9]{48}$/.test(sid)) return null;
    return sessions().findOne({ _id: { $eq: sid }, revokedAt: null });
  },

  async touch(sid) {
    await sessions().updateOne({ _id: { $eq: sid }, revokedAt: null }, { $set: { lastSeenAt: new Date() } });
  },

  async revoke(sid, reason) {
    const r = await sessions().updateOne(
      { _id: { $eq: sid }, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
    return r.modifiedCount;
  },

  async revokeAllForUser(userId, reason, exceptSid = null) {
    const filter = { userId: { $eq: userId }, revokedAt: null };
    if (exceptSid) filter._id = { $ne: exceptSid };
    const r = await sessions().updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
    return r.modifiedCount;
  },

  async listActive(userId) {
    return sessions()
      .find({ userId: { $eq: userId }, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastSeenAt: -1 })
      .limit(50)
      .toArray();
  },
};
