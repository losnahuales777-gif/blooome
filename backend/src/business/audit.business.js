import { logger } from '../config/logger.js';
import { AuditModel } from '../models/audit.model.js';

export const AuditBusiness = {
  // Fuera de transacciones: un fallo de auditoria se registra en el log pero no rompe la operacion.
  async record(entry) {
    try {
      await AuditModel.log(entry);
    } catch (err) {
      logger.error({ err, event: entry.event }, 'No se pudo registrar el evento de auditoria');
    }
  },

  async list(paging) {
    const { items, total } = await AuditModel.list(paging);
    return {
      items: items.map((a) => ({
        id: a.id,
        event: a.event,
        details: a.details,
        ip: a.ip_address,
        userEmail: a.user_email,
        createdAt: a.created_at,
      })),
      total,
      ...paging,
    };
  },
};
