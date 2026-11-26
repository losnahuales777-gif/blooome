import { Braces, Download, FileDown, FilePlus2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useResource } from '../../business/hooks/useResource.js';
import { fmt } from '../../models/analysis.model.js';
import { patientAccountsService } from '../../services/admin.service.js';
import { documentsService, privacyService } from '../../services/chart.service.js';
import Alert from '../ui/Alert.jsx';
import DataTable, { StatusBadge } from '../ui/DataTable.jsx';
import { ui } from '../ui/styles.js';

const MAX_BYTES = 5 * 1024 * 1024;
const size = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function saveBlob(pid, d) {
  const blob = await documentsService.download(pid, d.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = d.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Documentos del expediente: reportes PDF versionados y adjuntos. Ningun documento se edita ni se borra.
export default function DocumentsTab({ patientId, notes, canEdit }) {
  const { data, error, loading, reload } = useResource(() => documentsService.list(patientId), [patientId]);
  const types = data?.reportTypes ?? {};
  const [form, setForm] = useState({ type: 'historia', audience: 'clinico', noteId: notes[0]?.id ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [upload, setUpload] = useState({ file: null, description: '' });
  const fileRef = useRef(null);
  const thirdPartyOk = types[form.type]?.thirdParty;

  async function generate() {
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const d = await documentsService.generate(patientId, {
        type: form.type,
        audience: thirdPartyOk ? form.audience : 'clinico',
        ...(form.type === 'consulta' && { noteId: form.noteId }),
      });
      setMsg({ type: 'success', text: `${d.title} generado.` });
      reload();
      await saveBlob(patientId, d);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  // Exportacion HL7 FHIR R4 del expediente (Bundle JSON); queda registrada en la auditoria.
  async function exportFhir() {
    try {
      const blob = await privacyService.fhir(patientId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BL-${String(patientId).padStart(6, '0')}_fhir.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function sendFile(e) {
    e.preventDefault();
    const f = upload.file;
    if (!f) return setMsg({ type: 'error', text: 'Elige un archivo' });
    if (f.size > MAX_BYTES) return setMsg({ type: 'error', text: 'El archivo supera 5 MB' });
    setBusy(true);
    try {
      await documentsService.upload(patientId, f, upload.description.trim());
      setMsg({ type: 'success', text: 'Documento adjuntado.' });
      setUpload({ file: null, description: '' });
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: 'createdAt', label: 'Fecha', sortValue: (d) => new Date(d.createdAt).getTime(), render: (d) => fmt.dateTime(d.createdAt), searchable: false },
    { key: 'title', label: 'Documento', render: (d) => <span className="font-medium">{d.title}</span> },
    { key: 'kind', label: 'Tipo', render: (d) => <StatusBadge tone={d.kind === 'reporte' ? 'info' : 'neutral'}>{d.kind === 'reporte' ? 'Reporte' : 'Adjunto'}</StatusBadge> },
    {
      key: 'audience',
      label: 'Destino',
      render: (d) => (d.audience ? <StatusBadge tone={d.audience === 'terceros' ? 'warning' : 'success'}>{d.audience === 'terceros' ? 'Terceros' : 'Uso clinico'}</StatusBadge> : '—'),
    },
    {
      key: 'sharedWithPatient',
      label: 'Portal',
      searchable: false,
      sortValue: (d) => (d.sharedWithPatient ? 1 : 0),
      render: (d) =>
        canEdit ? (
          <label className="inline-flex items-center gap-1.5 text-xs" title="Visible para el paciente en su portal">
            <input
              type="checkbox"
              checked={d.sharedWithPatient}
              onChange={(e) =>
                patientAccountsService
                  .share(patientId, d.id, e.target.checked)
                  .then(() => reload())
                  .catch((err) => setMsg({ type: 'error', text: err.message }))
              }
            />
            {d.sharedWithPatient ? 'Compartido' : 'Privado'}
          </label>
        ) : (
          <StatusBadge tone={d.sharedWithPatient ? 'success' : 'neutral'}>{d.sharedWithPatient ? 'Compartido' : 'Privado'}</StatusBadge>
        ),
    },
    { key: 'sizeBytes', label: 'Tamano', align: 'right', searchable: false, render: (d) => size(d.sizeBytes) },
    { key: 'sha256', label: 'Huella', sortable: false, render: (d) => <span className="font-mono text-xs" title={d.sha256}>{d.sha256.slice(0, 12)}…</span> },
    {
      key: 'download',
      label: '',
      sortable: false,
      searchable: false,
      render: (d) => (
        <button type="button" className="rounded-md p-1.5 text-muted hover:bg-tint-strong" aria-label={`Descargar ${d.title}`} onClick={() => saveBlob(patientId, d).catch((err) => setMsg({ type: 'error', text: err.message }))}>
          <Download className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${ui.card} space-y-4 p-6`} aria-label="Generar reporte">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FileDown className="size-5" aria-hidden="true" /> Generar reporte PDF
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rep-type" className={ui.label}>
                Reporte
              </label>
              <select id="rep-type" className={ui.input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {Object.entries(types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rep-aud" className={ui.label}>
                Destino
              </label>
              <select id="rep-aud" className={ui.input} value={thirdPartyOk ? form.audience : 'clinico'} disabled={!thirdPartyOk} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="clinico">Uso clinico (completo)</option>
                <option value="terceros">Para terceros (datos minimos)</option>
              </select>
            </div>
          </div>
          {form.type === 'consulta' && (
            <div>
              <label htmlFor="rep-note" className={ui.label}>
                Nota de la consulta
              </label>
              <select id="rep-note" className={ui.input} value={form.noteId} onChange={(e) => setForm((f) => ({ ...f, noteId: e.target.value }))}>
                {notes.length === 0 && <option value="">Sin notas</option>}
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {fmt.dateTime(n.consultationAt)} ({n.status})
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-muted">
            {thirdPartyOk
              ? 'Para terceros: solo nombre, edad y el contenido del reporte; sin fecha de nacimiento, contacto, diagnosticos, antecedentes ni notas.'
              : 'Este reporte contiene informacion clinica: solo se genera para uso clinico.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.btnPrimary} disabled={busy || (form.type === 'consulta' && !form.noteId)} onClick={generate}>
              <FileDown className="size-4" aria-hidden="true" /> {busy ? 'Generando...' : 'Generar y descargar'}
            </button>
            <button type="button" className={ui.btnSecondary} onClick={exportFhir} title="Expediente en formato HL7 FHIR R4 (JSON)">
              <Braces className="size-4" aria-hidden="true" /> Exportar FHIR
            </button>
          </div>
        </section>

        {canEdit && (
          <form onSubmit={sendFile} className={`${ui.card} space-y-4 p-6`} aria-label="Adjuntar documento">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <FilePlus2 className="size-5" aria-hidden="true" /> Adjuntar documento
            </h3>
            <div>
              <label htmlFor="doc-file" className={ui.label}>
                Archivo (PDF, PNG o JPG; maximo 5 MB)
              </label>
              <input
                id="doc-file"
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm"
                onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] ?? null }))}
              />
            </div>
            <div>
              <label htmlFor="doc-desc" className={ui.label}>
                Descripcion
              </label>
              <input id="doc-desc" className={ui.input} maxLength={200} value={upload.description} onChange={(e) => setUpload((u) => ({ ...u, description: e.target.value }))} />
            </div>
            <button type="submit" className={ui.btnSecondary} disabled={busy || !upload.file || upload.description.trim().length < 3}>
              <Upload className="size-4" aria-hidden="true" /> Adjuntar
            </button>
          </form>
        )}
      </div>

      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <Alert>{error}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'createdAt', dir: 'desc' }} searchPlaceholder="Buscar documento" emptyText="Sin documentos. Genera un reporte o adjunta un archivo." />
    </div>
  );
}
