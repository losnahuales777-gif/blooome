import { Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useResource } from '../business/hooks/useResource.js';
import { FormDrawer } from '../components/analysis/AnalysisForms.jsx';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import Drawer from '../components/ui/Drawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { SEXES } from '../models/patient.model.js';
import { patientAccountsService } from '../services/admin.service.js';
import { usersService } from '../services/users.service.js';

const PORTAL = {
  sin_cuenta: { label: 'Sin cuenta', tone: 'neutral' },
  invitacion_pendiente: { label: 'Invitacion pendiente', tone: 'warning' },
  activa: { label: 'Activa', tone: 'success' },
  inactiva: { label: 'Inactiva', tone: 'danger' },
};

// Muestra el codigo de un solo uso una sola vez, para entregarlo por un canal seguro.
export function OneTimeCodeDrawer({ title, result, onClose }) {
  return (
    <Drawer title={title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p>
          Entrega este codigo a <span className="font-semibold">{result.email}</span> por un canal seguro (en persona o por telefono). Con
          el entra en <span className="font-mono">/activar</span> y define su contrasena.
        </p>
        <p className="rounded-xl bg-tint p-4 text-center font-mono text-2xl font-semibold tracking-widest">{result.code}</p>
        <p className="text-muted">
          Es de un solo uso y vence en {result.expiresInHours ? `${result.expiresInHours} horas` : `${result.expiresInMinutes} minutos`}. No se
          vuelve a mostrar: si se pierde, genera otro.
        </p>
      </div>
    </Drawer>
  );
}

function PatientForm({ nutritionists, patient, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: patient?.fullName ?? '',
    birthDate: patient?.birthDate ?? '',
    sex: patient?.sex ?? 'F',
    phone: '',
    nutritionistId: String(patient?.nutritionistId ?? nutritionists[0]?.id ?? ''),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <FormDrawer
      title={patient ? 'Editar datos basicos' : 'Registrar paciente'}
      submitLabel="Guardar"
      onClose={onClose}
      onSubmit={async () => {
        const base = { fullName: form.fullName.trim(), birthDate: form.birthDate, sex: form.sex, phone: form.phone.trim() };
        if (patient) await patientAccountsService.updateBasic(patient.id, base);
        else await patientAccountsService.createBasic({ ...base, nutritionistId: Number(form.nutritionistId) });
        onSaved();
      }}
    >
      <p className="text-sm text-muted">Solo datos basicos. Las medidas y la valoracion clinica las registra el nutriologo asignado.</p>
      <label className="block text-sm">
        <span className={ui.label}>Nombre completo</span>
        <input className={ui.input} maxLength={120} value={form.fullName} onChange={set('fullName')} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={ui.label}>Fecha de nacimiento</span>
          <input type="date" className={ui.input} value={form.birthDate} onChange={set('birthDate')} />
        </label>
        <label className="block text-sm">
          <span className={ui.label}>Sexo</span>
          <select className={ui.input} value={form.sex} onChange={set('sex')}>
            {SEXES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className={ui.label}>Telefono</span>
        <input type="tel" className={ui.input} maxLength={20} value={form.phone} onChange={set('phone')} />
      </label>
      {!patient && (
        <label className="block text-sm">
          <span className={ui.label}>Nutriologo asignado</span>
          <select className={ui.input} value={form.nutritionistId} onChange={set('nutritionistId')}>
            {nutritionists.map((n) => (
              <option key={n.id} value={n.id}>
                {n.fullName}
              </option>
            ))}
          </select>
        </label>
      )}
    </FormDrawer>
  );
}

export function InviteForm({ patient, onClose, onDone }) {
  const [email, setEmail] = useState('');
  return (
    <FormDrawer
      title={`Invitar al portal: ${patient.fullName}`}
      submitLabel="Generar invitacion"
      onClose={onClose}
      onSubmit={async () => onDone(await patientAccountsService.invite(patient.id, email.trim().toLowerCase()))}
    >
      <p className="text-sm text-muted">La cuenta queda vinculada a este expediente: el paciente solo vera su propia informacion.</p>
      <label className="block text-sm">
        <span className={ui.label}>Correo del paciente</span>
        <input type="email" className={ui.input} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
    </FormDrawer>
  );
}

export default function PatientDirectoryPage() {
  const { data, error, loading, reload } = useResource(() => patientAccountsService.directory(), []);
  const nutris = useResource(() => usersService.list({ page: 1, pageSize: 100, role: 'user' }), []);
  const nutritionists = (nutris.data?.items ?? []).filter((u) => u.isActive);
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState('');

  const columns = [
    { key: 'recordNumber', label: 'Expediente', render: (r) => <span className="font-mono text-sm">{r.recordNumber}</span> },
    { key: 'fullName', label: 'Paciente', render: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: 'age', label: 'Edad', align: 'right', searchable: false },
    { key: 'nutritionistName', label: 'Nutriologo' },
    {
      key: 'intakePending',
      label: 'Valoracion',
      sortValue: (r) => (r.intakePending ? 1 : 0),
      render: (r) => <StatusBadge tone={r.intakePending ? 'warning' : 'success'}>{r.intakePending ? 'Pendiente' : 'Realizada'}</StatusBadge>,
    },
    {
      key: 'portal',
      label: 'Portal',
      sortValue: (r) => r.portal.status,
      render: (r) => <StatusBadge tone={PORTAL[r.portal.status].tone}>{PORTAL[r.portal.status].label}</StatusBadge>,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      searchable: false,
      render: (r) => (
        <span className="flex gap-1">
          <button type="button" className={ui.btnSecondary} onClick={() => setPanel({ type: 'edit', patient: r })}>
            Editar
          </button>
          {r.portal.status !== 'activa' && (
            <button type="button" className={ui.btnSecondary} onClick={() => setPanel({ type: 'invite', patient: r })}>
              <Mail className="size-4" aria-hidden="true" /> Invitar
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Registro de pacientes"
        description="Datos basicos y cuentas del portal. Sin acceso al historial clinico."
        actions={
          <button type="button" className={ui.btnPrimary} disabled={nutritionists.length === 0} onClick={() => setPanel({ type: 'new' })}>
            <UserPlus className="size-4" aria-hidden="true" /> Registrar paciente
          </button>
        }
      />
      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'fullName', dir: 'asc' }} searchPlaceholder="Buscar paciente o expediente" />
      {(panel?.type === 'new' || panel?.type === 'edit') && (
        <PatientForm
          nutritionists={nutritionists}
          patient={panel.patient}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setNotice('Datos guardados.');
            reload();
          }}
        />
      )}
      {panel?.type === 'invite' && (
        <InviteForm
          patient={panel.patient}
          onClose={() => setPanel(null)}
          onDone={(result) => {
            setPanel({ type: 'code', result });
            reload();
          }}
        />
      )}
      {panel?.type === 'code' && <OneTimeCodeDrawer title="Invitacion generada" result={panel.result} onClose={() => setPanel(null)} />}
    </section>
  );
}
