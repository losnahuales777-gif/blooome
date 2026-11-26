import { collection, nextId, paging, withSession } from '../config/database.js';

const records = () => collection('records');

// Agrega el nombre del propietario (equivalente al JOIN con users).
function listPipeline(match, { page, pageSize }) {
  const { skip, limit } = paging({ page, pageSize });
  return [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'ownerId', foreignField: '_id', as: 'owner', pipeline: [{ $project: { fullName: 1 } }] } },
  ];
}

const toRow = (r) => ({
  id: r._id,
  title: r.title,
  description: r.description,
  created_at: r.createdAt,
  owner_id: r.ownerId,
  owner_name: r.owner?.[0]?.fullName ?? null,
});

export const RecordModel = {
  async create({ ownerId, title, description }) {
    const id = await nextId('records');
    await records().insertOne({ _id: id, ownerId, title, description, createdAt: new Date() });
    return id;
  },

  async listByOwner(ownerId, paginationOptions) {
    const match = { ownerId: { $eq: ownerId } };
    const [docs, total] = await Promise.all([
      records().aggregate(listPipeline(match, paginationOptions)).toArray(),
      records().countDocuments(match),
    ]);
    return { items: docs.map(toRow), total };
  },

  async listAll(paginationOptions) {
    const [docs, total] = await Promise.all([
      records().aggregate(listPipeline({}, paginationOptions)).toArray(),
      records().countDocuments(),
    ]);
    return { items: docs.map(toRow), total };
  },

  async transferOwnership(fromUserId, toUserId, session) {
    const result = await records().updateMany({ ownerId: { $eq: fromUserId } }, { $set: { ownerId: toUserId } }, withSession(session));
    return result.modifiedCount;
  },
};
