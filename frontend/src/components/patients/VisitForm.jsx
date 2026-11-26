import { useState } from 'react';
import { bmi, bmiCategory, toVisitPayload, validateVisit, visitToForm } from '../../models/patient.model.js';
import Alert from '../ui/Alert.jsx';
import Drawer from '../ui/Drawer.jsx';
import { ui } from '../ui/styles.js';
import BmiBadge from './BmiMark.jsx';

// Registra la consulta de hoy: nuevas mediciones y, opcionalmente, la siguiente cita.
export default function VisitForm({ patient, onSave, onClose }) {
  const [form, setForm] = useState(() => visitToForm(patient));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const weight = Number(form.weightKg);
  const newBmi = weight >= 30 ? bmi(weight, patient.heightCm) : null;
  const delta = weight >= 30 ? weight - patient.weightKg : 0;

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validateVisit(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setServerError('');
    try {
      await onSave(toVisitPayload(form));
    } catch (err) {
      setServerError(err.message);
      setSaving(false);
    }
  }

  const field = (name, label, props) => (
    <div>
      <label htmlFor={`vf-${name}`} className={ui.label}>
        {label}
      </label>
      <input id={`vf-${name}`} className={ui.input} value={form[name]} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
      {errors[name] && <p className={ui.fieldError}>{errors[name]}</p>}
    </div>
  );

  return (
    <Drawer
      title="Registrar consulta"
      onClose={onClose}
      footer={
        <>
          <button type="submit" form="visit-form" className={ui.btnPrimary} disabled={saving}>
            {saving ? 'Guardando...' : 'Registrar consulta'}
          </button>
          <button type="button" className={ui.btnSecondary} onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      <form id="visit-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="text-muted">
          Consulta de hoy con <span className="font-bold text-ink">{patient.fullName}</span>.
        </p>
        <Alert>{serverError}</Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          {field('weightKg', 'Peso de hoy (kg)', { type: 'number', step: '0.1', min: 30, max: 250, inputMode: 'decimal' })}
          {field('waistCm', 'Cintura (cm)', { type: 'number', min: 50, max: 200, inputMode: 'numeric' })}
        </div>

        {newBmi && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-tint p-4 text-sm">
            <span className="text-muted">IMC resultante</span>
            <BmiBadge category={bmiCategory(newBmi)} value={newBmi} />
            {delta !== 0 && (
              <span className="ml-auto font-bold tabular-nums">
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg desde la ultima medicion
              </span>
            )}
          </div>
        )}

        {field('nextVisit', 'Proxima cita (opcional)', { type: 'datetime-local' })}
      </form>
    </Drawer>
  );
}
