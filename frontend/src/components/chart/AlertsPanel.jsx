import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useResource } from '../../business/hooks/useResource.js';
import { fmt } from '../../models/analysis.model.js';
import { ALERT_PRIORITY } from '../../models/chart.model.js';
import { alertsService } from '../../services/chart.service.js';
import Alert from '../ui/Alert.jsx';
import { StatusBadge } from '../ui/DataTable.jsx';
import { ui } from '../ui/styles.js';

const STATUS = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  revisada: { label: 'Revisada', tone: 'success' },
  descartada: { label: 'Descartada', tone: 'neutral' },
};

// Una alerta con su motivo, prioridad, fecha, origen y estado de revision.
export function AlertItem({ alert, canReview, onReview, showPatient = false }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit(status) {
    setError('');
    try {
      await onReview(alert, status, note.trim());
      setMode(null);
      setNote('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <StatusBadge tone={ALERT_PRIORITY[alert.priority]?.tone}>{ALERT_PRIORITY[alert.priority]?.label}</StatusBadge>
        <div className="min-w-0 flex-1 text-sm">
          {showPatient && (
            <Link to={`/pacientes/${alert.patientId}`} className="font-semibold hover:underline">
              {alert.patientName}
            </Link>
          )}
          <p className={showPatient ? '' : 'font-medium'}>{alert.reason}</p>
          <p className="text-xs text-muted">
            {alert.origin} · regla "{alert.ruleName}" v{alert.ruleVersion}
            {alert.at && ` · ${fmt.dateTime(alert.at)}`}
          </p>
          {alert.review && (
            <p className="text-xs text-muted">
              {STATUS[alert.status].label} el {fmt.dateTime(alert.review.at)}
              {alert.review.note && `: ${alert.review.note}`}
            </p>
          )}
        </div>
        <StatusBadge tone={STATUS[alert.status].tone}>{STATUS[alert.status].label}</StatusBadge>
        {canReview && alert.status === 'pendiente' && !mode && (
          <span className="flex gap-1">
            <button type="button" className={ui.btnSecondary} onClick={() => setMode('revisada')}>
              <Check className="size-4" aria-hidden="true" /> Revisada
            </button>
            <button type="button" className={ui.btnSecondary} onClick={() => setMode('descartada')}>
              <X className="size-4" aria-hidden="true" /> Descartar
            </button>
          </span>
        )}
        {canReview && alert.status !== 'pendiente' && (
          <button type="button" className="text-xs text-muted underline" onClick={() => submit('pendiente')}>
            Reabrir
          </button>
        )}
      </div>
      {mode && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-60 flex-1 text-sm">
            <span className="mb-1 block text-muted">{mode === 'descartada' ? 'Motivo del descarte (obligatorio)' : 'Nota de la revision (opcional)'}</span>
            <input className={ui.input} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className={ui.btnPrimary} disabled={mode === 'descartada' && note.trim().length < 3} onClick={() => submit(mode)}>
            Confirmar
          </button>
          <button type="button" className={ui.btnSecondary} onClick={() => setMode(null)}>
            Cancelar
          </button>
        </div>
      )}
      <Alert>{error}</Alert>
    </li>
  );
}

// Alertas del paciente con filtro por estado.
export default function AlertsPanel({ patientId, canReview, version, onChanged }) {
  const [status, setStatus] = useState('pendiente');
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(() => alertsService.forPatient(patientId, status), [patientId, status, version, tick]);

  const review = async (alert, newStatus, note) => {
    await alertsService.review(patientId, alert.key, newStatus, note);
    setTick((t) => t + 1);
    onChanged?.();
  };

  return (
    <section className={`${ui.card} p-6`} aria-label="Alertas del paciente">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Alertas</h3>
          <p className="text-xs text-muted">Senalan registros que conviene revisar; no son diagnosticos.</p>
        </div>
        <select aria-label="Estado de las alertas" className={`${ui.input} w-auto!`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pendiente">Pendientes</option>
          <option value="revisada">Revisadas</option>
          <option value="descartada">Descartadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      <Alert>{error}</Alert>
      {loading && !data && <p className="text-sm text-muted">Cargando...</p>}
      {data?.items.length === 0 && <p className="text-sm text-muted">Sin alertas en este estado.</p>}
      <ul className="divide-y divide-line">
        {(data?.items ?? []).map((a) => (
          <AlertItem key={a.key} alert={a} canReview={canReview} onReview={review} />
        ))}
      </ul>
    </section>
  );
}
