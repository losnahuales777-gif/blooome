import { FolderOpen, Pencil, Salad, Stethoscope } from 'lucide-react';
import { Link } from 'react-router';
import { ACTIVITY_LEVELS, GOALS, SEXES } from '../../models/patient.model.js';
import Drawer from '../ui/Drawer.jsx';
import { ui } from '../ui/styles.js';
import BmiBadge from './BmiMark.jsx';

const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' });
const label = (list, code) => list.find((i) => i.code === code)?.label ?? '—';

function Row({ term, children }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  );
}

export default function PatientDetail({ patient: p, canEdit, onEdit, onRecordVisit, onClose }) {
  return (
    <Drawer
      title={p.fullName}
      onClose={onClose}
      footer={
        <>
          <Link to={`/pacientes/${p.id}`} className={ui.btnPrimary}>
            <FolderOpen className="size-4" aria-hidden="true" /> Abrir expediente
          </Link>
          <Link to={`/plan-alimenticio?paciente=${p.id}`} className={ui.btnSecondary}>
            <Salad className="size-4" aria-hidden="true" /> Abrir plan alimenticio
          </Link>
          {canEdit && (
            <>
              <button type="button" className={ui.btnSecondary} onClick={onRecordVisit}>
                <Stethoscope className="size-4" aria-hidden="true" /> Registrar consulta
              </button>
              <button type="button" className={ui.btnSecondary} onClick={onEdit}>
                <Pencil className="size-4" aria-hidden="true" /> Editar
              </button>
            </>
          )}
        </>
      }
    >
      <div className="mb-6 rounded-2xl border border-accent/25 bg-accent/10 p-5">
        <p className="text-sm text-muted">Meta energetica diaria</p>
        <p className="text-4xl font-semibold text-highlight tabular-nums">
          {p.kcalTarget.toLocaleString('es-MX')} <span className="text-lg font-medium">kcal</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          Mifflin-St Jeor, actividad {label(ACTIVITY_LEVELS, p.activity).toLowerCase()}, objetivo {label(GOALS, p.goal).toLowerCase()}.
        </p>
      </div>

      <dl className="divide-y divide-line text-sm">
        <Row term="Edad">{p.age} anos</Row>
        <Row term="Nacimiento">{dateFmt.format(new Date(`${p.birthDate}T00:00:00`))}</Row>
        <Row term="Sexo">{label(SEXES, p.sex)}</Row>
        <Row term="Peso">
          {p.weightKg} kg
          {p.measuredAt && <span className="ml-1 text-xs text-muted">(medido el {dateFmt.format(new Date(p.measuredAt))})</span>}
        </Row>
        <Row term="Estatura">{p.heightCm} cm</Row>
        <Row term="IMC">
          <BmiBadge category={p.bmiCategory} value={p.bmi} />
        </Row>
        <Row term="Cintura">{p.waistCm ? `${p.waistCm} cm` : '—'}</Row>
        <Row term="Telefono">{p.phone || '—'}</Row>
        <Row term="Ultima consulta">{p.lastVisit ? dateFmt.format(new Date(p.lastVisit)) : 'Sin registro'}</Row>
        <Row term="Proxima cita">{p.nextVisit ? dateTimeFmt.format(new Date(p.nextVisit)) : 'Sin agendar'}</Row>
      </dl>

      {p.notes && (
        <div className="mt-6">
          <h3 className="mb-1 font-semibold">Notas clinicas</h3>
          <p className="text-sm whitespace-pre-line text-muted">{p.notes}</p>
        </div>
      )}
    </Drawer>
  );
}
