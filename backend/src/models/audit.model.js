import { collection, paging, withSession } from '../config/database.js';

const auditLog = () => collection('auditLog');

export const AuditModel = {
  async log({ userId = null, event, details = null, ip = null, userAgent = null }, session) {
    await auditLog().insertOne(
      {
        userId,
        event,
        details: details?.slice(0, 500) ?? null,
        ipAddress: ip?.slice(0, 45) ?? null,
        userAgent: userAgent?.slice(0, 255) ?? null,
        createdAt: new Date(),
      },
      withSession(session),
    );
  },

  async list({ page, pageSize }) {
    const { skip, limit } = paging({ page, pageSize });
    const [docs, total] = await Promise.all([
      auditLog()
        .aggregate([
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user', pipeline: [{ $project: { email: 1 } }] } },
        ])
        .toArray(),
      auditLog().estimatedDocumentCount(),
    ]);
    return {
      items: docs.map((a) => ({
        id: a._id.toString(),
        event: a.event,
        details: a.details,
        ip_address: a.ipAddress,
        created_at: a.createdAt,
        user_email: a.user?.[0]?.email ?? null,
      })),
      total,
    };
  },
};
