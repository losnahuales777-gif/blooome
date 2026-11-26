import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useResource } from '../../business/hooks/useResource.js';
import { fmt } from '../../models/analysis.model.js';
import { consentsService, documentsService } from '../../services/chart.service.js';
import Alert from '../ui/Alert.jsx';
import { StatusBadge } from '../ui/DataTable.jsx';
import { ui } from '../ui/styles.js';

const STATUS = { otorgado: 'success', revocado: 'warning', negado: 'danger' };
const METHODS = { firma_autografa: 'Firma autografa', firma_electronica: 'Firma electronica', verbal_documentada: 'Verbal documentada' };

// Consentimientos del paciente: cada registro (otorgar, revocar, negar) se agrega al historial.
export default function ConsentsPanel({ patientId, canEdit, onChanged }) {
  const [tick, setTick] = useState(0);
  const { data, error } = useResource(() => consentsService.list(patientId), [patientId, tick]);
  const docs = useResource(() => documentsService.list(patientId), [patientId, tick]);
  // ?consentimiento=ia_asistente (desde el asistente de IA): preselecciona el tipo y lleva al formulario.
  const [params] = useSearchParams();
  const requested = params.get('consentimiento');
  const sectionRef = useRef(null);
  const [form, setForm] = useState({ type: requested ?? 'aviso_privacidad', status: 'otorgado', noticeVersion: '', method: 'firma_autografa', evidenceDocumentId: '', notes: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const attachments = (docs.data?.items ?? []).filter((d) => d.kind === 'adjunto');
  const typesLoaded = Boolean(data);
  useEffect(() => {
    if (requested && typesLoaded) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [requested, typesLoaded]);

  async function submit(e) {
    e.preventDefault();
    try {
      await consentsService.record(patientId, { ...form, evidenceDocumentId: form.evidenceDocumentId || null });
      setMsg({ type: 'success', text: 'Consentimiento registrado.' });
      setTick((t) => t + 1);
      onChanged?.();
    } catch (err) {
      setMsg({ type: 'error', text: err.details?.map((d) => d.message).join('. ') || err.message });
    }
  }

  return (
    <section ref={sectionRef} className={`${ui.card} scroll-mt-4 space-y-4 p-6`} aria-label="Consentimientos">
      <div>
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5" aria-hidden="true" /> Privacidad y consentimiento
        </h3>
        <p className="text-sm text-muted">Cada cambio se agrega al historial. Vincula el documento firmado (adjunto en Documentos) como evidencia.</p>
      </div>
      <Alert>{error}</Alert>
      {data && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.entries(data.types).map(([type, def]) => {
            const c = data.current[type];
            return (
              <li key={type} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-medium">{def.label}</p>
                <p className="mt-1">
                  {c ? <StatusBadge tone={STATUS[c.status]}>{c.status}</StatusBadge> : <StatusBadge tone={def.required ? 'warning' : 'neutral'}>{def.required ? 'Pendiente' : 'Sin registro'}</StatusBadge>}
                </p>
                {c && (
                  <p className="mt-1 text-xs text-muted">
                    Aviso {c.noticeVersion} · {METHODS[c.method]} · {fmt.dateTime(c.recordedAt)}
                    {c.evidenceDocumentId ? ' · con evidencia' : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && data && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl bg-tint p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className={ui.label}>Tipo</span>
            <select className={ui.input} value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(data.types).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={ui.label}>Estado</span>
            <select className={ui.input} value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="otorgado">Otorgado</option>
              <option value="revocado">Revocado</option>
              <option value="negado">Negado</option>
            </select>
          </label>
          <label className="text-sm">
            <span className={ui.label}>Version del aviso de privacidad</span>
            <input className={ui.input} maxLength={40} placeholder="Ej. 2026-01" value={form.noticeVersion} onChange={(e) => set('noticeVersion', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className={ui.label}>Medio</span>
            <select className={ui.input} value={form.method} onChange={(e) => set('method', e.target.value)}>
              {Object.entries(METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className={ui.label}>Evidencia (documento adjunto)</span>
            <select className={ui.input} value={form.evidenceDocumentId} onChange={(e) => set('evidenceDocumentId', e.target.value)}>
              <option value="">Sin evidencia</option>
              {attachments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({fmt.date(d.createdAt)})
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
            <button type="submit" className={`${ui.btnPrimary} mt-2`} disabled={!form.noticeVersion.trim()}>
              Registrar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
