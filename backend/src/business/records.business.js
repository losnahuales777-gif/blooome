import { RecordModel } from '../models/record.model.js';
import { PERMISSIONS } from './access.business.js';

function toRecordDto(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    createdAt: r.created_at,
  };
}

export const RecordsBusiness = {
  // Sin records.view_all cada usuario solo ve lo que el mismo capturo (evita IDOR, OWASP A01).
  async list(actor, paging) {
    const scope = actor.permissions.has(PERMISSIONS.RECORDS_VIEW_ALL) ? 'all' : 'own';
    const { items, total } = scope === 'all' ? await RecordModel.listAll(paging) : await RecordModel.listByOwner(actor.id, paging);
    return { items: items.map(toRecordDto), total, scope, ...paging };
  },

  async create(actor, { title, description }) {
    const id = await RecordModel.create({ ownerId: actor.id, title, description });
    return { id, title, description, ownerId: actor.id };
  },
};
