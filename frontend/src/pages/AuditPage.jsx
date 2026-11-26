import { useState } from 'react';
import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { ui } from '../components/ui/styles.js';
import { formatDate } from '../models/user.model.js';
import { accessService } from '../services/access.service.js';

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, error } = useResource(() => accessService.audit({ page, pageSize: PAGE_SIZE }), [page]);

  return (
    <section>
      <PageHeader title="Auditoria" description="Bitacora de eventos de seguridad (inicios de sesion, cambios de acceso)." />
      <Alert>{error}</Alert>
      <div className={`${ui.card} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-tint">
            <tr>
              <th className={ui.th}>Fecha</th>
              <th className={ui.th}>Evento</th>
              <th className={ui.th}>Usuario</th>
              <th className={ui.th}>Detalle</th>
              <th className={ui.th}>IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td className={`${ui.td} whitespace-nowrap`}>{formatDate(a.createdAt)}</td>
                <td className={`${ui.td} font-mono text-xs`}>{a.event}</td>
                <td className={ui.td}>{a.userEmail ?? '—'}</td>
                <td className={`${ui.td} max-w-sm truncate text-xs`}>{a.details ?? ''}</td>
                <td className={`${ui.td} font-mono text-xs`}>{a.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
      </div>
    </section>
  );
}
