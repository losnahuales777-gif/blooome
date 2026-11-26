import { ObjectId } from 'mongodb';
import { collection } from '../config/database.js';
import { toObjectId } from './clinical.model.js';

// Notificaciones para el usuario (portal del paciente). Texto breve, sin datos clinicos detallados.
const notifications = () => collection('notificaciones');

export const NotificationModel = {
  async create({ userId, type, title, body = '' }) {
    await notifications().insertOne({ _id: new ObjectId(), userId, type, title, body, readAt: null, createdAt: new Date() });
  },

  async listByUser(userId) {
    return notifications()
      .find({ userId: { $eq: userId } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  },

  async markRead(userId, id) {
    const r = await notifications().updateOne(
      { _id: { $eq: toObjectId(id) }, userId: { $eq: userId }, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return r.matchedCount === 1;
  },
};
