import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../business/auth/useAuth.js';
import { usePatients } from '../business/patients/usePatients.js';
import BmiBadge from '../components/patients/BmiMark.jsx';
import PatientDetail from '../components/patients/PatientDetail.jsx';
import PatientForm from '../components/patients/PatientForm.jsx';
import VisitForm from '../components/patients/VisitForm.jsx';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { BMI_CATEGORIES, GOALS } from '../models/patient.model.js';
import { patientsService } from '../services/patients.service.js';

const dateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');

// Compara sin acentos ni mayusculas.
const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function PatientsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(P.PATIENTS_MANAGE);
  const { patients, loading, error, reload } = usePatients();
  const [params, setParams] = useSearchParams();
  const [bmiFilter, setBmiFilter] = useState('');
  const [goalFilter, setGoalFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | paciente
  const [visiting, setVisiting] = useState(null);
  const [notice, setNotice] = useState('');

  const query = params.get('q') ?? '';
  const selectedId = Number(params.get('paciente')) || null;
  const selected = patients.find((p) => p.id === selectedId);

  const updateParams = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        return next;
      },
      { replace: true },
    );

  const visible = patients.filter(
    (p) =>
      (!query || normalize(p.fullName).includes(normalize(query))) &&
      (!bmiFilter || p.bmiCategory.code === bmiFilter) &&
      (!goalFilter || p.goal === goalFilter),
  );

  async function handleVisit(data) {
    await patientsService.recordVisit(visiting.id, data);
    setNotice(`Consulta de ${visiting.fullName} registrada.`);
    setVisiting(null);
    reload();
  }

  async function handleSave(data) {
    const saved =
      editing === 'new' ? await patientsService.create(data) : await patientsService.update(editing.id, data);
    setNotice(editing === 'new' ? `${saved.fullName} quedo registrado.` : 'Cambios guardados.');
    setEditing(null);
    reload();
    updateParams({ paciente: String(saved.id) });
  }

  return (
    <section>
      <PageHeader
        title="Pacientes"
        description="Pacientes de 18 a 60 anos en seguimiento nutricional."
        actions={
          canEdit && (
            <button type="button" className={ui.btnPrimary} onClick={() => setEditing('new')}>
              <UserPlus className="size-4" aria-hidden="true" /> Registrar paciente
            </button>
          )
        }
      />

      <div className="mb-4 space-y-2">
        <Alert>{error}</Alert>
        <Alert variant="success">{notice}</Alert>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <input
          type="search"
          value={query}
          onChange={(e) => updateParams({ q: e.target.value })}
          placeholder="Buscar por nombre"
          aria-label="Buscar por nombre"
          maxLength={80}
          className={ui.input}
        />
        <select aria-label="Filtrar por IMC" className={ui.input} value={bmiFilter} onChange={(e) => setBmiFilter(e.target.value)}>
          <option value="">Todas las categorias de IMC</option>
          {BMI_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por objetivo" className={ui.input} value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}>
          <option value="">Todos los objetivos</option>
          {GOALS.map((g) => (
            <option key={g.code} value={g.code}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-line">
          <thead>
            <tr>
              <th className={ui.th}>Paciente</th>
              <th className={`${ui.th} text-right`}>Edad</th>
              <th className={ui.th}>IMC</th>
              <th className={ui.th}>Objetivo</th>
              <th className={ui.th}>Ultima consulta</th>
              <th className={ui.th}>Proxima cita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-tint" onClick={() => updateParams({ paciente: String(p.id) })}>
                <td className={ui.td}>
                  <button
                    type="button"
                    className="text-left font-bold hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateParams({ paciente: String(p.id) });
                    }}
                  >
                    {p.fullName}
                  </button>
                  {p.phone && <p className="text-xs text-muted">{p.phone}</p>}
                </td>
                <td className={`${ui.td} text-right tabular-nums`}>{p.age}</td>
                <td className={ui.td}>
                  <BmiBadge category={p.bmiCategory} value={p.bmi} />
                </td>
                <td className={ui.td}>{GOALS.find((g) => g.code === p.goal)?.label}</td>
                <td className={`${ui.td} whitespace-nowrap`}>{formatDate(p.lastVisit)}</td>
                <td className={`${ui.td} whitespace-nowrap`}>{p.nextVisit ? formatDate(p.nextVisit) : <span className="text-muted">Sin agendar</span>}</td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className={`${ui.td} py-10 text-center text-muted`}>
                  {patients.length === 0 ? 'Aun no hay pacientes. Registra el primero para empezar.' : 'Ningun paciente coincide con los filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="px-4 py-6 text-sm text-muted">Cargando pacientes...</p>}
      </div>

      {selected && !editing && !visiting && (
        <PatientDetail
          patient={selected}
          canEdit={canEdit}
          onEdit={() => setEditing(selected)}
          onRecordVisit={() => setVisiting(selected)}
          onClose={() => updateParams({ paciente: null })}
        />
      )}
      {visiting && <VisitForm patient={visiting} onSave={handleVisit} onClose={() => setVisiting(null)} />}
      {editing && (
        <PatientForm patient={editing === 'new' ? null : editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
