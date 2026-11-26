import { useState } from 'react';
import {
  ACTIVITY_LEVELS,
  AGE_RANGE,
  ageFrom,
  birthDateBounds,
  GOALS,
  isInAgeRange,
  patientToForm,
  SEXES,
  toPatientPayload,
  toPatientUpdatePayload,
  validateNewPatient,
  validatePatient,
} from '../../models/patient.model.js';
import Alert from '../ui/Alert.jsx';
import Drawer from '../ui/Drawer.jsx';
import { ui } from '../ui/styles.js';

export default function PatientForm({ patient, onSave, onClose }) {
  const [form, setForm] = useState(() => patientToForm(patient));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const bounds = birthDateBounds();
  const age = form.birthDate ? ageFrom(form.birthDate) : null;

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = patient ? validatePatient(form, { withMeasures: false }) : validateNewPatient(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setServerError('');
    try {
      await onSave(patient ? toPatientUpdatePayload(form) : toPatientPayload(form));
    } catch (err) {
      setServerError(err.message);
      setSaving(false);
    }
  }

  const field = (name, label, props = {}, hint) => (
    <div>
      <label htmlFor={`pf-${name}`} className={ui.label}>
        {label}
      </label>
      <input
        id={`pf-${name}`}
        className={ui.input}
        value={form[name]}
        onChange={set(name)}
        aria-invalid={Boolean(errors[name])}
        {...props}
      />
      {errors[name] ? <p className={ui.fieldError}>{errors[name]}</p> : hint}
    </div>
  );

  const select = (name, label, options) => (
    <div>
      <label htmlFor={`pf-${name}`} className={ui.label}>
        {label}
      </label>
      <select id={`pf-${name}`} className={ui.input} value={form[name]} onChange={set(name)}>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Drawer
      title={patient ? 'Editar paciente' : 'Registrar paciente'}
      onClose={onClose}
      footer={
        <>
          <button type="submit" form="patient-form" className={ui.btnPrimary} disabled={saving}>
            {saving ? 'Guardando...' : patient ? 'Guardar cambios' : 'Registrar paciente'}
          </button>
          <button type="button" className={ui.btnSecondary} onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <Alert>{serverError}</Alert>
        {field('fullName', 'Nombre completo', { maxLength: 120, autoComplete: 'off' })}

        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'birthDate',
            'Fecha de nacimiento',
            { type: 'date', min: bounds.min, max: bounds.max },
            age !== null && (
              <p className={`mt-1 text-xs ${isInAgeRange(age) ? 'text-muted' : 'text-danger'}`}>
                {isInAgeRange(age) ? `${age} anos` : `${age} anos: fuera del rango ${AGE_RANGE.min}-${AGE_RANGE.max}`}
              </p>
            ),
          )}
          {select('sex', 'Sexo', SEXES)}
        </div>

        {patient ? (
          <p className="rounded-xl bg-tint px-4 py-3 text-sm text-muted">
            Las medidas no se editan aqui: registra una medicion nueva (o una correccion con motivo) desde la ficha del
            paciente para conservar el historico.
          </p>
        ) : (
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm text-muted">Mediciones iniciales</legend>
            {field('weightKg', 'Peso (kg)', { type: 'number', step: '0.1', min: 30, max: 250, inputMode: 'decimal' })}
            {field('heightCm', 'Estatura (cm)', { type: 'number', min: 130, max: 220, inputMode: 'numeric' })}
            {field('waistCm', 'Cintura (cm)', { type: 'number', min: 50, max: 200, inputMode: 'numeric' })}
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {select('activity', 'Actividad fisica', ACTIVITY_LEVELS)}
          {select('goal', 'Objetivo', GOALS)}
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm text-muted">Prescripcion (opcional)</legend>
          {field('targetWeightKg', 'Peso objetivo (kg)', { type: 'number', step: '0.1', min: 30, max: 250, inputMode: 'decimal' })}
          {field('proteinGPerKg', 'Proteina (g por kg)', { type: 'number', step: '0.1', min: 0.3, max: 3.5, inputMode: 'decimal' })}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={form.isActive !== false}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          Expediente activo
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {field('phone', 'Telefono', { type: 'tel', maxLength: 20, autoComplete: 'off' })}
          {field('nextVisit', 'Proxima cita', { type: 'datetime-local' })}
        </div>

        <div>
          <label htmlFor="pf-notes" className={ui.label}>
            Notas clinicas
          </label>
          <textarea id="pf-notes" rows={3} maxLength={1000} className={ui.input} value={form.notes} onChange={set('notes')} />
        </div>
      </form>
    </Drawer>
  );
}
