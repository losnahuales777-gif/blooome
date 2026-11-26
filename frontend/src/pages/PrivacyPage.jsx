import { Link } from 'react-router';
import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { fmt } from '../models/analysis.model.js';
import { privacyService } from '../services/chart.service.js';

const CONSENT_LABELS = { aviso_privacidad: 'Aviso de privacidad', datos_sensibles: 'Datos de salud' };

// Conservacion de expedientes y cobertura de consentimientos. Solo informa: nunca borra expedientes.
export default function PrivacyPage() {
  const { data, error, loading } = useResource(() => privacyService.retention(), []);
  const columns = [
    {
      key: 'fullName',
      label: 'Paciente',
      render: (r) => (
        <Link to={`/pacientes/${r.patientId}?tab=historia`} className="font-medium hover:underline">
          {r.fullName}
        </Link>
      ),
    },
    { key: 'recordStatus', label: 'Expediente' },
    { key: 'lastActivity', label: 'Ultima actividad', sortValue: (r) => new Date(r.lastActivity).getTime(), render: (r) => fmt.date(r.lastActivity), searchable: false },
    { key: 'retainUntil', label: 'Conservar hasta', sortValue: (r) => new Date(r.retainUntil).getTime(), render: (r) => fmt.date(r.retainUntil), searchable: false },
    {
      key: 'retentionDue',
      label: 'Plazo',
      sortValue: (r) => (r.retentionDue ? 1 : 0),
      render: (r) => <StatusBadge tone={r.retentionDue ? 'warning' : 'success'}>{r.retentionDue ? 'Cumplido: revisar' : 'Vigente'}</StatusBadge>,
    },
    {
      key: 'missingConsents',
      label: 'Consentimientos',
      sortValue: (r) => r.missingConsents.length,
      searchable: false,
      render: (r) =>
        r.missingConsents.length ? (
          <span className="flex flex-wrap gap-1">
            {r.missingConsents.map((c) => (
              <StatusBadge key={c} tone="warning">
                Falta: {CONSENT_LABELS[c] ?? c}
              </StatusBadge>
            ))}
          </span>
        ) : (
          <StatusBadge tone="success">Completos</StatusBadge>
        ),
    },
  ];
  return (
    <section className="space-y-4">
      <PageHeader
        title="Privacidad y conservacion"
        description={`Plazo de conservacion de cada expediente: ${data?.years ?? '—'} anos desde su ultima actividad.`}
      />
      <Alert variant="info">
        La aplicacion no borra expedientes: un plazo cumplido solo indica que el expediente debe revisarse conforme a la politica de
        conservacion de tu institucion. El plazo y los tipos de consentimiento deben confirmarse con asesoria juridica.
      </Alert>
      <Alert>{error}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey="patientId" loading={loading} initialSort={{ key: 'retainUntil', dir: 'asc' }} searchPlaceholder="Buscar paciente" />
    </section>
  );
}
