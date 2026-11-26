import { useState } from 'react';
import {
  formatResult,
  INTAKE_FIELDS,
  MEASUREMENT_FIELDS,
  MEASUREMENT_METHODS,
  parseNumbers,
  toDay,
} from '../../models/analysis.model.js';
import { captureWarning } from '../../models/chart.model.js';
import { isoToLocalInput, localInputToIso } from '../../models/patient.model.js';
import Alert from '../ui/Alert.jsx';
import Drawer from '../ui/Drawer.jsx';
import { ui } from '../ui/styles.js';

// Formulario generico en panel lateral: valida, envia y muestra errores del servidor.
export function FormDrawer({ title, submitLabel, onClose, onSubmit, children }) {
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');
    setSaving(true);
    try {
      const ok = await onSubmit();
      if (ok === false) setSaving(false);
    } catch (err) {
      setServerError(err.details?.map((d) => d.message).join('. ') || err.message);
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="submit" form="analysis-form" className={ui.btnPrimary} disabled={saving}>
            {saving ? 'Guardando...' : submitLabel}
          </button>
          <button type="button" className={ui.btnSecondary} onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      <form id="analysis-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <Alert>{serverError}</Alert>
        {children}
      </form>
    </Drawer>
  );
}

// previous = { campo: { value, takenAt } } de la ultima medicion: se muestra junto al campo y se avisa
// (sin bloquear) cuando el valor nuevo difiere mucho, para detectar errores de captura o de unidad.
function NumberGrid({ fields, form, errors, onChange, previous = {} }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`af-${f.key}`} className={ui.label}>
            {f.label} {f.unit && <span className="font-normal text-muted">({f.unit})</span>}
          </label>
          <input
            id={`af-${f.key}`}
            type="number"
            inputMode="decimal"
            min={f.min}
            max={f.max}
            step={f.step}
            className={ui.input}
            value={form[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            aria-invalid={Boolean(errors[f.key])}
          />
          {errors[f.key] && <p className={ui.fieldError}>{errors[f.key]}</p>}
          {previous[f.key] && (
            <p className="mt-1 text-xs text-muted">
              Anterior: {previous[f.key].value} {f.unit} ({new Date(previous[f.key].takenAt).toLocaleDateString('es-MX')})
            </p>
          )}
          {previous[f.key] && form[f.key] !== '' && form[f.key] !== undefined && (
            <p className="mt-1 text-xs text-warning" role="status">
              {captureWarning(Number(form[f.key]), previous[f.key].value)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const nowLocal = () => isoToLocalInput(new Date().toISOString());

export function MeasurementForm({ onSave, onClose, previous }) {
  const [form, setForm] = useState({ takenAt: nowLocal(), method: MEASUREMENT_METHODS[0], notes: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <FormDrawer
      title="Nueva medicion"
      submitLabel="Guardar medicion"
      onClose={onClose}
      onSubmit={async () => {
        const { values, errors: e } = parseNumbers(form, MEASUREMENT_FIELDS);
        if (!form.takenAt || new Date(form.takenAt) > new Date()) e.takenAt = 'Indica una fecha que no sea futura';
        if (Object.values(values).every((v) => v === null)) e.form = 'Registra al menos una medicion';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await onSave({ takenAt: localInputToIso(form.takenAt), ...values, method: form.method, notes: form.notes.trim() });
      }}
    >
      <Alert>{errors.form}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="af-takenAt" className={ui.label}>
            Fecha y hora de la medicion
          </label>
          <input id="af-takenAt" type="datetime-local" className={ui.input} value={form.takenAt} max={nowLocal()} onChange={(e) => set('takenAt', e.target.value)} />
          {errors.takenAt && <p className={ui.fieldError}>{errors.takenAt}</p>}
        </div>
        <div>
          <label htmlFor="af-method" className={ui.label}>
            Metodo
          </label>
          <select id="af-method" className={ui.input} value={form.method} onChange={(e) => set('method', e.target.value)}>
            {MEASUREMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <NumberGrid fields={MEASUREMENT_FIELDS} form={form} errors={errors} onChange={set} previous={previous} />
      <p className="text-xs text-muted">Deja vacio lo que no se midio: no se estiman ni se rellenan valores faltantes.</p>
      <div>
        <label htmlFor="af-notes" className={ui.label}>
          Notas
        </label>
        <textarea id="af-notes" rows={2} maxLength={500} className={ui.input} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </FormDrawer>
  );
}

export function CorrectionForm({ measurement, onSave, onClose }) {
  const initial = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, measurement.values?.[f.key] ?? '']));
  const [form, setForm] = useState({ ...initial, reason: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <FormDrawer
      title="Corregir medicion"
      submitLabel="Guardar correccion"
      onClose={onClose}
      onSubmit={async () => {
        const { values, errors: e } = parseNumbers(form, MEASUREMENT_FIELDS);
        if (form.reason.trim().length < 5) e.reason = 'Explica el motivo de la correccion';
        setErrors(e);
        if (Object.keys(e).length) return false;
        const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (measurement.values?.[k] ?? null)));
        await onSave({ ...changed, reason: form.reason.trim() });
      }}
    >
      <p className="text-sm text-muted">
        Medicion del {new Date(measurement.takenAt).toLocaleString('es-MX')}. La version original se conserva en el historico.
      </p>
      <NumberGrid fields={MEASUREMENT_FIELDS} form={form} errors={errors} onChange={set} />
      <div>
        <label htmlFor="af-reason" className={ui.label}>
          Motivo de la correccion
        </label>
        <input id="af-reason" className={ui.input} maxLength={300} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
        {errors.reason && <p className={ui.fieldError}>{errors.reason}</p>}
      </div>
    </FormDrawer>
  );
}

export function IntakeForm({ onSave, onClose }) {
  const [form, setForm] = useState({ date: toDay(new Date()), activityType: '', notes: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <FormDrawer
      title="Registrar consumo del dia"
      submitLabel="Guardar registro"
      onClose={onClose}
      onSubmit={async () => {
        const { values, errors: e } = parseNumbers(form, INTAKE_FIELDS);
        if (!form.date || form.date > toDay(new Date())) e.date = 'Indica una fecha que no sea futura';
        if (values.mealsFollowed !== null && values.mealsPlanned !== null && values.mealsFollowed > values.mealsPlanned) {
          e.mealsFollowed = 'No puede superar las comidas planificadas';
        }
        if (Object.values(values).every((v) => v === null)) e.form = 'Registra al menos un dato';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await onSave({
          date: form.date,
          ...values,
          mealsPlanned: values.mealsPlanned === null ? null : Math.round(values.mealsPlanned),
          mealsFollowed: values.mealsFollowed === null ? null : Math.round(values.mealsFollowed),
          activityType: form.activityType.trim() || null,
          notes: form.notes.trim(),
        });
      }}
    >
      <Alert>{errors.form}</Alert>
      <div>
        <label htmlFor="af-date" className={ui.label}>
          Dia
        </label>
        <input id="af-date" type="date" className={`${ui.input} w-auto`} value={form.date} max={toDay(new Date())} onChange={(e) => set('date', e.target.value)} />
        {errors.date && <p className={ui.fieldError}>{errors.date}</p>}
      </div>
      <NumberGrid fields={INTAKE_FIELDS} form={form} errors={errors} onChange={set} />
      <div>
        <label htmlFor="af-activity" className={ui.label}>
          Tipo de actividad
        </label>
        <input id="af-activity" className={ui.input} maxLength={60} placeholder="caminata, gimnasio..." value={form.activityType} onChange={(e) => set('activityType', e.target.value)} />
      </div>
    </FormDrawer>
  );
}

export function LabForm({ onSave, onClose }) {
  const [form, setForm] = useState({ takenAt: nowLocal(), analyte: '', value: '', unit: '', referenceRange: '', laboratory: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const text = (k, label, props = {}) => (
    <div>
      <label htmlFor={`af-${k}`} className={ui.label}>
        {label}
      </label>
      <input id={`af-${k}`} className={ui.input} value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
      {errors[k] && <p className={ui.fieldError}>{errors[k]}</p>}
    </div>
  );

  return (
    <FormDrawer
      title="Resultado de laboratorio"
      submitLabel="Guardar resultado"
      onClose={onClose}
      onSubmit={async () => {
        const e = {};
        if (form.analyte.trim().length < 2) e.analyte = 'Indica el estudio';
        if (!Number.isFinite(Number(form.value)) || form.value === '') e.value = 'Indica un valor numerico';
        if (!form.unit.trim()) e.unit = 'Indica la unidad';
        if (!form.takenAt || new Date(form.takenAt) > new Date()) e.takenAt = 'Indica una fecha que no sea futura';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await onSave({
          takenAt: localInputToIso(form.takenAt),
          analyte: form.analyte.trim(),
          value: Number(form.value),
          unit: form.unit.trim(),
          referenceRange: form.referenceRange.trim(),
          laboratory: form.laboratory.trim(),
        });
      }}
    >
      {text('takenAt', 'Fecha de la muestra', { type: 'datetime-local', max: nowLocal() })}
      {text('analyte', 'Estudio', { maxLength: 60, placeholder: 'Glucosa en ayuno' })}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('value', 'Valor', { type: 'number', inputMode: 'decimal', step: 'any' })}
        {text('unit', 'Unidad', { maxLength: 20, placeholder: 'mg/dL' })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('referenceRange', 'Rango de referencia', { maxLength: 60, placeholder: '70-99' })}
        {text('laboratory', 'Laboratorio', { maxLength: 80 })}
      </div>
    </FormDrawer>
  );
}

// Indicadores medibles para dar seguimiento a un objetivo.
const GOAL_INDICATORS = Object.freeze([
  { formula: 'peso', label: 'Peso', unit: 'kg' },
  { formula: 'cintura', label: 'Cintura', unit: 'cm' },
  { formula: 'imc', label: 'IMC', unit: 'kg/m2' },
  { formula: 'grasa_corporal', label: 'Grasa corporal', unit: '%' },
  { formula: 'adherencia_plan', label: 'Adherencia al plan', unit: '%' },
]);

export function GoalForm({ onSave, onClose, diagnoses = [] }) {
  const today = toDay(new Date());
  const [form, setForm] = useState({ description: '', targetDate: '', diagnosisId: '', indicator: '', targetValue: '', periodStart: today });
  const [errors, setErrors] = useState({});

  return (
    <FormDrawer
      title="Nuevo objetivo"
      submitLabel="Agregar objetivo"
      onClose={onClose}
      onSubmit={async () => {
        const e = {};
        if (form.description.trim().length < 3) e.description = 'Describe el objetivo';
        const ind = GOAL_INDICATORS.find((i) => i.formula === form.indicator);
        if (ind && !Number.isFinite(Number.parseFloat(form.targetValue))) e.targetValue = 'Indica el valor meta';
        if (form.targetDate && form.periodStart && form.targetDate < form.periodStart) e.targetDate = 'Debe ser posterior al inicio';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await onSave({
          description: form.description.trim(),
          targetDate: form.targetDate || null,
          diagnosisId: form.diagnosisId || null,
          periodStart: form.periodStart || null,
          indicator: ind ? { formula: ind.formula, targetValue: Number.parseFloat(form.targetValue), unit: ind.unit } : null,
        });
      }}
    >
      <div>
        <label htmlFor="af-goal" className={ui.label}>
          Objetivo
        </label>
        <input id="af-goal" className={ui.input} maxLength={200} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        {errors.description && <p className={ui.fieldError}>{errors.description}</p>}
      </div>
      <div>
        <label htmlFor="af-goal-date" className={ui.label}>
          Fecha meta (opcional)
        </label>
        <input id="af-goal-date" type="date" className={`${ui.input} w-auto`} value={form.targetDate} min={form.periodStart || undefined} onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))} />
        {errors.targetDate && <p className={ui.fieldError}>{errors.targetDate}</p>}
      </div>
      <div>
        <label htmlFor="af-goal-start" className={ui.label}>
          Inicio del periodo de seguimiento
        </label>
        <input id="af-goal-start" type="date" className={`${ui.input} w-auto`} value={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="af-goal-ind" className={ui.label}>
            Indicador (opcional)
          </label>
          <select id="af-goal-ind" className={ui.input} value={form.indicator} onChange={(e) => setForm((p) => ({ ...p, indicator: e.target.value }))}>
            <option value="">Sin indicador</option>
            {GOAL_INDICATORS.map((i) => (
              <option key={i.formula} value={i.formula}>
                {i.label} ({i.unit})
              </option>
            ))}
          </select>
        </div>
        {form.indicator && (
          <div>
            <label htmlFor="af-goal-target" className={ui.label}>
              Valor meta ({GOAL_INDICATORS.find((i) => i.formula === form.indicator)?.unit})
            </label>
            <input id="af-goal-target" type="number" step="0.1" inputMode="decimal" className={ui.input} value={form.targetValue} onChange={(e) => setForm((p) => ({ ...p, targetValue: e.target.value }))} aria-invalid={Boolean(errors.targetValue)} />
            {errors.targetValue && <p className={ui.fieldError}>{errors.targetValue}</p>}
          </div>
        )}
      </div>
      {diagnoses.length > 0 && (
        <div>
          <label htmlFor="af-goal-dx" className={ui.label}>
            Diagnostico relacionado (opcional)
          </label>
          <select id="af-goal-dx" className={ui.input} value={form.diagnosisId} onChange={(e) => setForm((p) => ({ ...p, diagnosisId: e.target.value }))}>
            <option value="">Sin vincular</option>
            {diagnoses.map((d) => (
              <option key={d.id} value={d.id}>
                {d.problem}
              </option>
            ))}
          </select>
        </div>
      )}
    </FormDrawer>
  );
}

export function OverrideForm({ result, onSave, onClose }) {
  const [form, setForm] = useState({ value: '', reason: '' });
  const [errors, setErrors] = useState({});

  return (
    <FormDrawer
      title={`Ajustar: ${result.label}`}
      submitLabel="Guardar ajuste"
      onClose={onClose}
      onSubmit={async () => {
        const e = {};
        if (form.value === '' || !Number.isFinite(Number(form.value))) e.value = 'Indica el valor ajustado';
        if (form.reason.trim().length < 5) e.reason = 'Justifica el ajuste (minimo 5 caracteres)';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await onSave({ formula: result.formula, adjustedValue: Number(form.value), reason: form.reason.trim() });
      }}
    >
      <p className="text-sm text-muted">
        Valor calculado: <span className="font-semibold text-ink">{formatResult(result.value, result.unit)}</span>. El ajuste
        sustituye el valor efectivo sin borrar el calculado, y queda registrado con tu nombre y la fecha.
      </p>
      <div>
        <label htmlFor="af-ov-value" className={ui.label}>
          Valor ajustado ({result.unit})
        </label>
        <input id="af-ov-value" type="number" inputMode="decimal" step="any" className={ui.input} value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} />
        {errors.value && <p className={ui.fieldError}>{errors.value}</p>}
      </div>
      <div>
        <label htmlFor="af-ov-reason" className={ui.label}>
          Justificacion clinica
        </label>
        <textarea id="af-ov-reason" rows={3} maxLength={300} className={ui.input} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
        {errors.reason && <p className={ui.fieldError}>{errors.reason}</p>}
      </div>
    </FormDrawer>
  );
}
