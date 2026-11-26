import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { fmt } from '../models/analysis.model.js';
import { systemService } from '../services/admin.service.js';

// Supervision operativa: accesos y volumen de acciones por usuario (sin el contenido de las acciones).
export default function ActivityPage() {
  const { data, error, loading } = useResource(() => systemService.activity(), []);
  const columns = [
    { key: 'fullName', label: 'Usuario', render: (u) => <span className="font-medium">{u.fullName}</span> },
    { key: 'email', label: 'Correo' },
    { key: 'role', label: 'Rol' },
    { key: 'isActive', label: 'Estado', sortValue: (u) => (u.isActive ? 1 : 0), render: (u) => <StatusBadge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Activo' : 'Inactivo'}</StatusBadge> },
    { key: 'lastLoginAt', label: 'Ultimo acceso', sortValue: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : null), render: (u) => fmt.dateTime(u.lastLoginAt), searchable: false },
    { key: 'logins30d', label: 'Accesos (30 d)', align: 'right', searchable: false },
    { key: 'actions30d', label: 'Acciones (30 d)', align: 'right', searchable: false },
    { key: 'activeSessions', label: 'Sesiones abiertas', align: 'right', searchable: false },
  ];
  return (
    <section className="space-y-4">
      <PageHeader title="Actividad de usuarios" description="Accesos y volumen de actividad de los ultimos 30 dias. No muestra informacion clinica." />
      <Alert>{error}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'lastLoginAt', dir: 'desc' }} searchPlaceholder="Buscar usuario" />
    </section>
  );
}
