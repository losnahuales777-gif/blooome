import { ClipboardPaste, FilePlus2, FileSignature, History, PenLine, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../business/auth/useAuth.js';
import { fmt, formatResult, MEASUREMENT_FIELDS } from '../../models/analysis.model.js';
import { HISTORY_STATUS, NOTE_STATUS, SOAP_SECTIONS, VERIFY_CATEGORIES } from '../../models/chart.model.js';
import { chartService } from '../../services/chart.service.js';
import Alert from '../ui/Alert.jsx';
import { StatusBadge } from '../ui/DataTable.jsx';
import { ui } from '../ui/styles.js';

const AUTOSAVE_MS = 1500;
const COMPARE = [
  ['imc', 'IMC', 'kg/m2'],
  ['cambio_peso_pct', 'Cambio de peso', '%'],
  ['indice_cintura_estatura', 'Indice cintura/estatura', 'razon'],
  ['masa_grasa', 'Masa grasa', 'kg'],
  ['gasto_energetico_total', 'Gasto energetico', 'kcal/dia'],
  ['adherencia_plan', 'Adherencia', '%'],
];

// Lista de notas del paciente y editor de la nota seleccionada.
export default function SoapNotes({ patientId, notes, history = [], categories = {}, canEdit, onChanged, initialNoteId }) {
  const [openId, setOpenId] = useState(
    (notes.some((n) => n.id === initialNoteId) && initialNoteId) || notes.find((n) => n.status === 'borrador')?.id || notes[0]?.id || null,
  );
  const [error, setError] = useState('');

  async function createNote() {
    setError('');
    try {
      const note = await chartService.createNote(patientId, { consultationAt: new Date().toISOString() });
      setOpenId(note.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className={`${ui.card} h-fit p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Notas clinicas</h3>
          {canEdit && (
            <button type="button" className={ui.btnPrimary} onClick={createNote}>
              <FilePlus2 className="size-4" aria-hidden="true" /> Nueva
            </button>
          )}
        </div>
        <Alert>{error}</Alert>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">Sin notas. Crea la nota SOAP de la consulta actual.</p>
        ) : (
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(n.id)}
                  aria-current={openId === n.id}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${openId === n.id ? 'bg-accent/12 text-ink' : 'hover:bg-tint'}`}
                >
                  <span className="block font-medium">{fmt.dateTime(n.consultationAt)}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <StatusBadge tone={NOTE_STATUS[n.status].tone}>{NOTE_STATUS[n.status].label}</StatusBadge>
                    {n.authorName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {openId ? <NoteEditor key={openId} patientId={patientId} noteId={openId} authorName={notes.find((n) => n.id === openId)?.authorName} history={history} categories={categories} canEdit={canEdit} onChanged={onChanged} /> : <div />}
    </div>
  );
}

function NoteEditor({ patientId, noteId, authorName, history, categories, canEdit, onChanged }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [soap, setSoap] = useState(null);
  const [save, setSave] = useState({ state: 'idle', at: null, error: '' });
  const [confirming, setConfirming] = useState(false);
  const [addendum, setAddendum] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const version = useRef(0);
  const dirty = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await chartService.getNote(patientId, noteId);
      version.current = d.note.version;
      dirty.current = false;
      setData(d);
      setSoap(d.note.soap);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }, [patientId, noteId]);

  useEffect(() => {
    load();
  }, [load]);

  const flush = useCallback(
    async (next) => {
      if (!dirty.current) return true;
      clearTimeout(timer.current);
      setSave({ state: 'saving', at: null, error: '' });
      try {
        const saved = await chartService.saveDraft(patientId, noteId, { expectedVersion: version.current, soap: next });
        version.current = saved.version;
        dirty.current = false;
        setSave({ state: 'saved', at: saved.updatedAt, error: '' });
        return true;
      } catch (err) {
        setSave({ state: 'error', at: null, error: err.message });
        return false;
      }
    },
    [patientId, noteId],
  );

  // Guarda pendientes al salir de la nota.
  useEffect(() => () => clearTimeout(timer.current), []);

  // Aviso del navegador si se intenta cerrar la pagina con cambios del borrador sin guardar.
  useEffect(() => {
    if (save.state !== 'pending' && save.state !== 'saving') return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save.state]);

  if (!data || !soap) return <div className={`${ui.card} p-6 text-sm text-muted`}>{notice.text || 'Cargando nota...'}</div>;

  const { note, versions, comparison, diagnoses, consultation } = data;
  const editable = canEdit && note.status === 'borrador' && note.authorId === user?.id;
  const missing = SOAP_SECTIONS.filter((s) => !soap[s.key]?.trim());
  // Datos vigentes que conviene confirmar en esta consulta (no se confirmaron desde el dia de la consulta).
  const dayStart = new Date(note.consultationAt);
  dayStart.setHours(0, 0, 0, 0);
  const toVerify = history.filter((h) => VERIFY_CATEGORIES.includes(h.category) && h.status === 'activo');
  const unverified = toVerify.filter((h) => !h.lastVerifiedAt || new Date(h.lastVerifiedAt) < dayStart);
  // Revision previa a la firma: avisos de informacion faltante (no bloquean la firma).
  const checklist = [
    !consultation && 'La nota no esta vinculada a ninguna consulta.',
    consultation && consultation.measurements.length === 0 && 'La consulta no tiene mediciones registradas.',
    !history.some((h) => h.category === 'alergia') && 'No hay registro de alergias (registra tambien "sin alergias conocidas").',
    unverified.length > 0 && `${unverified.length} antecedente(s) vigente(s) sin confirmar en esta consulta.`,
  ].filter(Boolean);

  function change(key, value) {
    const next = { ...soap, [key]: value };
    setSoap(next);
    dirty.current = true;
    setSave({ state: 'pending', at: null, error: '' });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), AUTOSAVE_MS);
  }

  async function sign() {
    if (!(await flush(soap))) return;
    try {
      await chartService.signNote(patientId, noteId);
      setConfirming(false);
      setNotice({ type: 'success', text: 'Nota firmada. A partir de ahora solo admite adendas.' });
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function addAddendum(e) {
    e.preventDefault();
    try {
      await chartService.addAddendum(patientId, noteId, addendum.trim());
      setAddendum('');
      setNotice({ type: 'success', text: 'Adenda agregada.' });
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  return (
    <article className={`${ui.card} space-y-6 p-6`} aria-label="Nota clinica SOAP">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Consulta del {fmt.dateTime(note.consultationAt)}</h3>
          <p className="mt-1 text-sm text-muted">
            {note.authorName ?? authorName ?? 'Autor'} · version {note.version}
            {note.signedAt && ` · firmada el ${fmt.dateTime(note.signedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {editable && (
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {save.state === 'pending' && 'Cambios sin guardar'}
              {save.state === 'saving' && 'Guardando...'}
              {save.state === 'saved' && `Borrador guardado ${fmt.dateTime(save.at)}`}
            </span>
          )}
          <StatusBadge tone={NOTE_STATUS[note.status].tone}>{NOTE_STATUS[note.status].label}</StatusBadge>
        </div>
      </header>

      <Alert>{save.error}</Alert>
      <Alert variant={notice.type || 'info'}>{notice.text}</Alert>
      {!editable && note.status === 'borrador' && <Alert variant="info">Solo el autor puede editar y firmar este borrador.</Alert>}

      <ConsultationPanel
        consultation={consultation}
        onInsert={editable ? (text) => change('o', soap.o.trim() ? `${soap.o.trimEnd()}\n${text}` : text) : null}
      />
      {canEdit && note.status === 'borrador' && toVerify.length > 0 && (
        <VerifyPanel
          patientId={patientId}
          items={toVerify}
          unverified={unverified}
          categories={categories}
          appointmentId={consultation?.appointmentId ?? null}
          onVerified={onChanged}
        />
      )}

      <div className="space-y-5">
        {SOAP_SECTIONS.map((s) => (
          <div key={s.key}>
            <label htmlFor={`soap-${s.key}`} className={ui.label}>
              <span className="mr-2 inline-flex size-6 items-center justify-center rounded-md bg-accent/15 text-xs font-bold text-highlight">{s.letter}</span>
              {s.label}
            </label>
            <p className="mb-2 text-xs text-muted">{s.hint}</p>
            {editable ? (
              <textarea
                id={`soap-${s.key}`}
                rows={4}
                maxLength={10000}
                className={`${ui.input} min-h-28 resize-y leading-relaxed`}
                value={soap[s.key]}
                onChange={(e) => change(s.key, e.target.value)}
              />
            ) : (
              <p id={`soap-${s.key}`} className="rounded-xl bg-tint px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {soap[s.key] || <span className="text-muted">Sin registrar</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {editable &&
        (confirming ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-medium text-ink">Al firmar, la nota queda cerrada y no podra editarse; las correcciones se hacen con adendas.</p>
            <p className="mt-1 text-sm text-muted">Confirma que revisaste las cuatro secciones.</p>
            {checklist.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink" aria-label="Informacion faltante">
                {checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" className={ui.btnPrimary} onClick={sign}>
                <FileSignature className="size-4" aria-hidden="true" /> Firmar nota
              </button>
              <button type="button" className={ui.btnSecondary} onClick={() => setConfirming(false)}>
                Volver
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={ui.btnPrimary} disabled={missing.length > 0} onClick={() => setConfirming(true)}>
              <FileSignature className="size-4" aria-hidden="true" /> Revisar y firmar
            </button>
            {missing.length > 0 && <span className="text-sm text-muted">Falta completar: {missing.map((s) => s.label).join(', ')}</span>}
          </div>
        ))}

      {note.status === 'firmada' && (
        <section className="space-y-3 border-t border-line pt-5">
          <h4 className="text-base font-semibold">Adendas</h4>
          {note.addenda.length === 0 && <p className="text-sm text-muted">Sin adendas.</p>}
          <ul className="space-y-2">
            {note.addenda.map((a, i) => (
              <li key={i} className="rounded-xl bg-tint px-4 py-3 text-sm">
                <p className="text-xs text-muted">{fmt.dateTime(a.at)}</p>
                <p className="mt-1 whitespace-pre-wrap">{a.text}</p>
              </li>
            ))}
          </ul>
          {canEdit && (
            <form onSubmit={addAddendum} className="space-y-2">
              <label htmlFor="addendum" className={ui.label}>
                Nueva adenda
              </label>
              <textarea id="addendum" rows={3} maxLength={5000} className={ui.input} value={addendum} onChange={(e) => setAddendum(e.target.value)} />
              <button type="submit" className={ui.btnSecondary} disabled={addendum.trim().length < 5}>
                <PenLine className="size-4" aria-hidden="true" /> Agregar adenda
              </button>
            </form>
          )}
          {note.contentHash && <p className="font-mono text-xs break-all text-muted">Huella de integridad (SHA-256): {note.contentHash}</p>}
        </section>
      )}

      <section className="border-t border-line pt-5">
        <h4 className="mb-1 text-base font-semibold">Comparacion con la consulta anterior</h4>
        <p className="mb-3 text-xs text-muted">Evaluaciones guardadas mas cercanas a esta nota. Sin evaluacion, el valor queda vacio.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={ui.th}>Indicador</th>
                <th className={`${ui.th} text-right`}>Anterior {comparison.previous && `(${fmt.date(comparison.previous.computedAt)})`}</th>
                <th className={`${ui.th} text-right`}>Actual {comparison.current && `(${fmt.date(comparison.current.computedAt)})`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COMPARE.map(([f, label, unit]) => {
                const v = (e) => e?.results.find((r) => r.formula === f)?.effectiveValue ?? null;
                return (
                  <tr key={f}>
                    <td className={ui.td}>{label}</td>
                    <td className={`${ui.td} text-right tabular-nums`}>{formatResult(v(comparison.previous), unit)}</td>
                    <td className={`${ui.td} text-right tabular-nums`}>{formatResult(v(comparison.current), unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {diagnoses.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-medium">Diagnosticos de esta nota:</span> {diagnoses.map((d) => d.problem).join('; ')}
          </p>
        )}
      </section>

      <details className="border-t border-line pt-5">
        <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold">
          <History className="size-4" aria-hidden="true" /> Historial de versiones ({versions.length})
        </summary>
        <ol className="mt-3 space-y-2">
          {versions.map((v) => (
            <li key={`${v.version}-${v.kind}`} className="rounded-xl bg-tint px-4 py-2 text-sm">
              <span className="font-medium">v{v.version}</span> · {v.kind} · {fmt.dateTime(v.savedAt)}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

// Mediciones registradas en la misma consulta: sirven de referencia para la seccion Objetivo (O).
function ConsultationPanel({ consultation, onInsert }) {
  if (!consultation) {
    return <p className="rounded-xl bg-tint px-4 py-3 text-sm text-muted">Nota sin consulta vinculada (no hay una cita realizada o programada cercana a esta fecha).</p>;
  }
  const fields = MEASUREMENT_FIELDS.filter((f) => consultation.measurements.some((m) => Number.isFinite(m.values?.[f.key])));
  return (
    <section className="rounded-xl border border-line p-4" aria-label="Datos de la consulta">
      <h4 className="text-sm font-semibold">
        Consulta {consultation.status} · {fmt.dateTime(consultation.completedAt ?? consultation.scheduledAt)}
      </h4>
      {onInsert && consultation.measurements.length > 0 && (
        <button
          type="button"
          className={`${ui.btnSecondary} mt-2`}
          onClick={() =>
            onInsert(
              consultation.measurements
                .map(
                  (m) =>
                    `Mediciones (${m.method}): ` +
                    fields
                      .filter((f) => Number.isFinite(m.values?.[f.key]))
                      .map((f) => `${f.label.toLowerCase()} ${fmt.number(m.values[f.key])} ${f.unit}`)
                      .join(', '),
                )
                .join('\n'),
            )
          }
        >
          <ClipboardPaste className="size-4" aria-hidden="true" /> Insertar en Objetivo (O)
        </button>
      )}
      {consultation.measurements.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Sin mediciones registradas en esta consulta.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {consultation.measurements.map((m) => (
            <li key={m.id}>
              <span className="text-muted">{fmt.dateTime(m.takenAt)} · {m.method}:</span>{' '}
              {fields
                .filter((f) => Number.isFinite(m.values?.[f.key]))
                .map((f) => `${f.label} ${fmt.number(m.values[f.key])} ${f.unit}`)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Reutilizacion de informacion vigente: el profesional confirma que alergias, medicamentos y
// enfermedades siguen igual (sin volver a capturarlos) o abre la historia clinica para actualizarlos.
function VerifyPanel({ patientId, items, unverified, categories, appointmentId, onVerified }) {
  const [selected, setSelected] = useState(() => new Set(unverified.map((h) => h.id)));
  const [msg, setMsg] = useState({ type: '', text: '' });
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function confirm() {
    try {
      await chartService.verifyHistory(patientId, [...selected], appointmentId);
      setMsg({ type: 'success', text: 'Datos confirmados como vigentes en esta consulta.' });
      setSelected(new Set());
      onVerified();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <section className="rounded-xl border border-line p-4" aria-label="Verificar datos vigentes">
      <h4 className="text-sm font-semibold">Datos vigentes del paciente</h4>
      <p className="mb-2 text-xs text-muted">Marca los que el paciente confirma sin cambios. Si algo cambio, actualizalo en Historia clinica.</p>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <ul className="space-y-1 text-sm">
        {items.map((h) => (
          <li key={h.id}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
              <span>
                <span className="text-muted">{categories[h.category] ?? h.category}:</span> {h.description}
                {h.dose && ` (${h.dose}${h.frequency ? `, ${h.frequency}` : ''})`}
                <span className="block text-xs text-muted">
                  {HISTORY_STATUS[h.status]} · {h.lastVerifiedAt ? `confirmado ${fmt.dateTime(h.lastVerifiedAt)}` : 'sin confirmar'}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className={`${ui.btnSecondary} mt-3`} disabled={selected.size === 0} onClick={confirm}>
        <ShieldCheck className="size-4" aria-hidden="true" /> Confirmar vigentes ({selected.size})
      </button>
    </section>
  );
}
