import { Calculator, CheckCircle2, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { fmt, formatResult } from '../../models/analysis.model.js';
import { chartService } from '../../services/chart.service.js';
import { FormDrawer } from '../analysis/AnalysisForms.jsx';
import Alert from '../ui/Alert.jsx';
import { StatusBadge } from '../ui/DataTable.jsx';
import CatalogSearch from '../ui/CatalogSearch.jsx';
import { ui } from '../ui/styles.js';

const bmiOf = (e) => e.results?.find((r) => r.formula === 'imc')?.effectiveValue ?? null;

// Diagnostico nutricional en formato PES, siempre documentado por el profesional y sustentado en
// una evaluacion guardada del mismo paciente. El sistema no genera diagnosticos automaticos.
function DiagnosisForm({ patientId, evaluations, notes, onClose, onSaved }) {
  const [form, setForm] = useState({ evaluationId: evaluations[0]?.id ?? '', noteId: '', problem: '', catalog: null, etiology: '', signs: '', code: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k, label, max, rows) => (
    <div>
      <label htmlFor={`dx-${k}`} className={ui.label}>
        {label}
      </label>
      {rows ? (
        <textarea id={`dx-${k}`} rows={rows} maxLength={max} className={ui.input} value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])} />
      ) : (
        <input id={`dx-${k}`} maxLength={max} className={ui.input} value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])} />
      )}
      {errors[k] && <p className={ui.fieldError}>{errors[k]}</p>}
    </div>
  );

  return (
    <FormDrawer
      title="Nuevo diagnostico nutricional"
      submitLabel="Registrar diagnostico"
      onClose={onClose}
      onSubmit={async () => {
        const e = {};
        if (!form.evaluationId) e.evaluationId = 'Selecciona la evaluacion que lo sustenta';
        if (form.problem.trim().length < 3) e.problem = 'Indica el problema';
        if (form.etiology.trim().length < 3) e.etiology = 'Indica la etiologia';
        if (form.signs.trim().length < 3) e.signs = 'Indica signos y sintomas';
        setErrors(e);
        if (Object.keys(e).length) return false;
        await chartService.createDiagnosis(patientId, {
          evaluationId: form.evaluationId,
          noteId: form.noteId || null,
          problem: form.problem.trim(),
          catalog: form.catalog,
          etiology: form.etiology.trim(),
          signs: form.signs.trim(),
          code: form.catalog ? null : form.code.trim() || null,
        });
        onSaved();
      }}
    >
      <div>
        <label htmlFor="dx-evaluationId" className={ui.label}>
          Evaluacion que lo sustenta
        </label>
        <select id="dx-evaluationId" className={ui.input} value={form.evaluationId} onChange={(e) => set('evaluationId', e.target.value)} aria-invalid={Boolean(errors.evaluationId)}>
          {evaluations.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {fmt.dateTime(ev.computedAt)} · IMC {formatResult(bmiOf(ev), 'kg/m2')}
            </option>
          ))}
        </select>
        {errors.evaluationId && <p className={ui.fieldError}>{errors.evaluationId}</p>}
      </div>
      {notes.length > 0 && (
        <div>
          <label htmlFor="dx-noteId" className={ui.label}>
            Nota de consulta (opcional)
          </label>
          <select id="dx-noteId" className={ui.input} value={form.noteId} onChange={(e) => set('noteId', e.target.value)}>
            <option value="">Sin vincular</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {fmt.dateTime(n.consultationAt)} ({n.status})
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <CatalogSearch
          id="dx-problem"
          type="diagnostico"
          label="Problema (P)"
          value={{ text: form.problem, catalog: form.catalog }}
          onChange={({ text: problem, catalog }) => setForm((f) => ({ ...f, problem, catalog }))}
          invalid={Boolean(errors.problem)}
        />
        {errors.problem && <p className={ui.fieldError}>{errors.problem}</p>}
      </div>
      {text('etiology', 'Etiologia (E): relacionado con...', 500, 2)}
      {text('signs', 'Signos y sintomas (S): evidenciado por...', 500, 2)}
      {!form.catalog && text('code', 'Codigo de terminologia (opcional)', 30)}
    </FormDrawer>
  );
}

export default function DiagnosesTab({ patientId, diagnoses, evaluations, notes, canEdit, onChanged }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  async function newEvaluation() {
    try {
      await chartService.createEvaluation(patientId);
      setNotice({ type: 'success', text: 'Evaluacion guardada con los datos vigentes del paciente.' });
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function setStatus(d, status) {
    try {
      await chartService.setDiagnosisStatus(patientId, d.id, status);
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  return (
    <section className={`${ui.card} space-y-4 p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Diagnosticos nutricionales</h3>
          <p className="text-sm text-muted">Formato PES (problema, etiologia, signos). Cada uno se vincula a la evaluacion que lo sustenta.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.btnSecondary} onClick={newEvaluation}>
              <Calculator className="size-4" aria-hidden="true" /> Guardar evaluacion actual
            </button>
            <button type="button" className={ui.btnPrimary} disabled={evaluations.length === 0} onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Diagnostico
            </button>
          </div>
        )}
      </div>
      <Alert variant={notice.type || 'info'}>{notice.text}</Alert>
      {canEdit && evaluations.length === 0 && <Alert variant="info">Guarda primero una evaluacion para poder documentar un diagnostico.</Alert>}
      {diagnoses.length === 0 ? (
        <p className="text-sm text-muted">Sin diagnosticos documentados.</p>
      ) : (
        <ul className="divide-y divide-line">
          {diagnoses.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-3 py-4">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-base font-semibold">
                  {d.problem} {d.code && <span className="font-mono text-xs text-muted">[{d.code}]</span>}
                </p>
                <p className="mt-1">
                  <span className="text-muted">Relacionado con</span> {d.etiology}
                </p>
                <p>
                  <span className="text-muted">Evidenciado por</span> {d.signs}
                </p>
                <p className="mt-1 text-xs text-muted">Registrado {fmt.dateTime(d.recordedAt)}{d.resolvedAt && ` · resuelto ${fmt.dateTime(d.resolvedAt)}`}</p>
              </div>
              <StatusBadge tone={d.status === 'activo' ? 'warning' : 'success'}>{d.status === 'activo' ? 'Activo' : 'Resuelto'}</StatusBadge>
              {canEdit &&
                (d.status === 'activo' ? (
                  <button type="button" className={ui.btnSecondary} onClick={() => setStatus(d, 'resuelto')}>
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Marcar resuelto
                  </button>
                ) : (
                  <button type="button" className={ui.btnSecondary} onClick={() => setStatus(d, 'activo')}>
                    <RotateCcw className="size-4" aria-hidden="true" /> Reactivar
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <DiagnosisForm
          patientId={patientId}
          evaluations={evaluations}
          notes={notes}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setNotice({ type: 'success', text: 'Diagnostico registrado.' });
            onChanged();
          }}
        />
      )}
    </section>
  );
}
