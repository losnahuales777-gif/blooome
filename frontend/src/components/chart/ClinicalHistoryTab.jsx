import { History, Pencil, Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmt } from '../../models/analysis.model.js';
import { categoryApplies, HISTORY_STATUS, historyFieldsFor, RECORD_STATUS } from '../../models/chart.model.js';
import { chartService } from '../../services/chart.service.js';
import { FormDrawer } from '../analysis/AnalysisForms.jsx';
import Alert from '../ui/Alert.jsx';
import { StatusBadge } from '../ui/DataTable.jsx';
import Drawer from '../ui/Drawer.jsx';
import CatalogSearch from '../ui/CatalogSearch.jsx';
import ConsentsPanel from './ConsentsPanel.jsx';
import { ui } from '../ui/styles.js';

const field = (id, label, input, error) => (
  <div>
    <label htmlFor={id} className={ui.label}>
      {label}
    </label>
    {input}
    {error && <p className={ui.fieldError}>{error}</p>}
  </div>
);

// A. Identificacion ampliada del paciente.
function IdentificationForm({ chart, canEdit, onSaved }) {
  const p = chart.patient;
  const id0 = p.identification ?? {};
  const [form, setForm] = useState({
    email: id0.email ?? '',
    address: id0.address ?? '',
    occupation: id0.occupation ?? '',
    consultReason: id0.consultReason ?? '',
    emergencyContact: { name: '', relationship: '', phone: '', ...id0.emergencyContact },
    recordStatus: p.recordStatus ?? 'activo',
  });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setEc = (k, v) => setForm((f) => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: v } }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await chartService.updateIdentification(p.id, form);
      setMsg({ type: 'success', text: 'Identificacion actualizada.' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.details?.map((d) => d.message).join('. ') || err.message });
    } finally {
      setSaving(false);
    }
  }

  const dis = !canEdit;
  return (
    <form onSubmit={submit} className={`${ui.card} space-y-5 p-6`} aria-label="Identificacion del paciente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">Identificacion</h3>
        <span className="font-mono text-sm text-muted">Expediente {p.recordNumber}</span>
      </div>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Nombre</dt>
          <dd className="font-medium">{p.fullName}</dd>
        </div>
        <div>
          <dt className="text-muted">Fecha de nacimiento</dt>
          <dd className="font-medium">{fmt.date(`${p.birthDate}T00:00:00`)}</dd>
        </div>
        <div>
          <dt className="text-muted">Fecha de ingreso</dt>
          <dd className="font-medium">{fmt.date(p.admissionDate)}</dd>
        </div>
      </dl>
      <fieldset disabled={dis} className="grid gap-4 sm:grid-cols-2">
        {field('id-email', 'Correo electronico', <input id="id-email" type="email" className={ui.input} maxLength={254} value={form.email} onChange={(e) => set('email', e.target.value)} />)}
        {field('id-occupation', 'Ocupacion', <input id="id-occupation" className={ui.input} maxLength={80} value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />)}
        <div className="sm:col-span-2">
          {field('id-address', 'Domicilio', <input id="id-address" className={ui.input} maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} />)}
        </div>
        <div className="sm:col-span-2">
          {field('id-reason', 'Motivo de consulta', <textarea id="id-reason" rows={3} className={ui.input} maxLength={500} value={form.consultReason} onChange={(e) => set('consultReason', e.target.value)} />)}
        </div>
        {field('id-ec-name', 'Contacto de emergencia', <input id="id-ec-name" className={ui.input} maxLength={120} value={form.emergencyContact.name} onChange={(e) => setEc('name', e.target.value)} />)}
        <div className="grid grid-cols-2 gap-4">
          {field('id-ec-rel', 'Parentesco', <input id="id-ec-rel" className={ui.input} maxLength={40} value={form.emergencyContact.relationship} onChange={(e) => setEc('relationship', e.target.value)} />)}
          {field('id-ec-phone', 'Telefono', <input id="id-ec-phone" type="tel" className={ui.input} maxLength={20} value={form.emergencyContact.phone} onChange={(e) => setEc('phone', e.target.value)} />)}
        </div>
        {field(
          'id-status',
          'Estado del expediente',
          <select id="id-status" className={ui.input} value={form.recordStatus} onChange={(e) => set('recordStatus', e.target.value)}>
            {Object.entries(RECORD_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>,
        )}
      </fieldset>
      {canEdit && (
        <button type="submit" className={ui.btnPrimary} disabled={saving}>
          <Save className="size-4" aria-hidden="true" /> {saving ? 'Guardando...' : 'Guardar identificacion'}
        </button>
      )}
    </form>
  );
}

// B. Formulario de antecedente con campos condicionales por categoria.
function HistoryForm({ chart, item, onClose, onSaved }) {
  const categories = Object.entries(chart.categories).filter(([k]) => categoryApplies(k, chart.patient.sex));
  const [form, setForm] = useState({
    category: item?.category ?? categories[0][0],
    description: item?.description ?? '',
    catalog: item?.catalog ?? null,
    status: item?.status ?? 'activo',
    onsetDate: item?.onsetDate ?? '',
    endDate: item?.endDate ?? '',
    severity: item?.severity ?? '',
    dose: item?.dose ?? '',
    frequency: item?.frequency ?? '',
    notes: item?.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const show = historyFieldsFor(form.category);

  return (
    <FormDrawer
      title={item ? 'Actualizar antecedente' : 'Nuevo antecedente'}
      submitLabel={item ? 'Guardar nueva version' : 'Registrar'}
      onClose={onClose}
      onSubmit={async () => {
        const e = {};
        if (form.description.trim().length < 2) e.description = 'Describe el antecedente';
        if (form.onsetDate && form.endDate && form.onsetDate > form.endDate) e.endDate = 'Debe ser posterior al inicio';
        setErrors(e);
        if (Object.keys(e).length) return false;
        const payload = {
          description: form.description.trim(),
          catalog: form.catalog,
          status: form.status,
          onsetDate: form.onsetDate || null,
          endDate: form.endDate || null,
          severity: show.severity && form.severity ? form.severity : null,
          dose: show.dose && form.dose.trim() ? form.dose.trim() : null,
          frequency: show.frequency && form.frequency.trim() ? form.frequency.trim() : null,
          notes: form.notes.trim(),
        };
        if (item) await chartService.updateHistory(chart.patient.id, item.id, payload);
        else await chartService.addHistory(chart.patient.id, { category: form.category, ...payload });
        onSaved(item ? 'Se guardo una nueva version; la anterior se conserva.' : 'Antecedente registrado.');
      }}
    >
      {item ? (
        <p className="text-sm text-muted">{chart.categories[item.category]}</p>
      ) : (
        field(
          'h-cat',
          'Categoria',
          <select id="h-cat" className={ui.input} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>,
        )
      )}
      {form.category === 'medicamento' ? (
        <div>
          <CatalogSearch
            id="h-desc"
            type="medicamento"
            label="Medicamento"
            value={{ text: form.description, catalog: form.catalog }}
            onChange={({ text, catalog }) => setForm((f) => ({ ...f, description: text, catalog }))}
            invalid={Boolean(errors.description)}
          />
          {errors.description && <p className={ui.fieldError}>{errors.description}</p>}
        </div>
      ) : (
        field('h-desc', 'Descripcion', <input id="h-desc" className={ui.input} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value, catalog: null }))} aria-invalid={Boolean(errors.description)} />, errors.description)
      )}
      {field(
        'h-status',
        'Estado',
        <select id="h-status" className={ui.input} value={form.status} onChange={(e) => set('status', e.target.value)}>
          {Object.entries(HISTORY_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>,
      )}
      {show.severity &&
        field(
          'h-sev',
          'Severidad referida',
          <select id="h-sev" className={ui.input} value={form.severity} onChange={(e) => set('severity', e.target.value)}>
            <option value="">Sin especificar</option>
            <option value="leve">Leve</option>
            <option value="moderada">Moderada</option>
            <option value="grave">Grave</option>
          </select>,
        )}
      {(show.dose || show.frequency) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {show.dose && field('h-dose', 'Dosis', <input id="h-dose" className={ui.input} maxLength={60} value={form.dose} onChange={(e) => set('dose', e.target.value)} />)}
          {show.frequency && field('h-freq', 'Frecuencia', <input id="h-freq" className={ui.input} maxLength={60} value={form.frequency} onChange={(e) => set('frequency', e.target.value)} />)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('h-on', 'Fecha de inicio', <input id="h-on" type="date" className={ui.input} value={form.onsetDate} onChange={(e) => set('onsetDate', e.target.value)} />)}
        {field('h-end', 'Fecha de fin', <input id="h-end" type="date" className={ui.input} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />, errors.endDate)}
      </div>
      {field('h-notes', 'Observaciones', <textarea id="h-notes" rows={3} className={ui.input} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />)}
    </FormDrawer>
  );
}

function VersionsDrawer({ patientId, item, onClose }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    chartService
      .historyVersions(patientId, item.id)
      .then((r) => active && setVersions(r.items ?? r))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [patientId, item.id]);
  return (
    <Drawer title="Versiones del antecedente" onClose={onClose}>
      <Alert>{error}</Alert>
      {!versions && !error && <p className="text-sm text-muted">Cargando...</p>}
      <ol className="space-y-3">
        {(versions ?? []).map((v) => (
          <li key={v.id} className="rounded-xl bg-tint px-4 py-3 text-sm">
            <p className="font-medium">
              v{v.version} · {HISTORY_STATUS[v.status]} {v.superseded ? '' : '(vigente)'}
            </p>
            <p className="mt-1">{v.description}</p>
            <p className="mt-1 text-xs text-muted">Registrado {fmt.dateTime(v.recordedAt)}</p>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}

// B. Antecedentes agrupados por categoria (vigentes) + identificacion.
export default function ClinicalHistoryTab({ chart, canEdit, onChanged }) {
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState('');
  const byCategory = Object.entries(chart.categories)
    .filter(([k]) => categoryApplies(k, chart.patient.sex))
    .map(([k, label]) => ({ key: k, label, items: chart.history.filter((h) => h.category === k) }));

  return (
    <div className="space-y-6">
      <IdentificationForm chart={chart} canEdit={canEdit} onSaved={onChanged} />
      <ConsentsPanel patientId={chart.patient.id} canEdit={canEdit} onChanged={onChanged} />

      <section className={`${ui.card} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Antecedentes</h3>
            <p className="text-sm text-muted">Cada cambio crea una version nueva; ninguna version anterior se borra.</p>
          </div>
          {canEdit && (
            <button type="button" className={ui.btnPrimary} onClick={() => setPanel({ type: 'new' })}>
              <Plus className="size-4" aria-hidden="true" /> Agregar antecedente
            </button>
          )}
        </div>
        <Alert variant="success">{notice}</Alert>
        <div className="grid gap-4 md:grid-cols-2">
          {byCategory.map((c) => (
            <div key={c.key} className="rounded-xl border border-line p-4">
              <h4 className="text-sm font-semibold">{c.label}</h4>
              {c.items.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Sin registro</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {c.items.map((h) => (
                    <li key={h.id} className="flex items-start gap-2 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{h.description}</p>
                        <p className="text-xs text-muted">
                          {[HISTORY_STATUS[h.status], h.severity && `severidad ${h.severity}`, h.dose, h.frequency, h.onsetDate && `desde ${h.onsetDate}`].filter(Boolean).join(' · ')}
                          {h.version > 1 && ` · v${h.version}`}
                        </p>
                      </div>
                      {h.version > 1 && (
                        <button type="button" className="rounded-md p-1 text-muted hover:bg-tint-strong" aria-label="Ver versiones" onClick={() => setPanel({ type: 'versions', item: h })}>
                          <History className="size-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className="rounded-md p-1 text-muted hover:bg-tint-strong" aria-label={`Actualizar ${h.description}`} onClick={() => setPanel({ type: 'edit', item: h })}>
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {(panel?.type === 'new' || panel?.type === 'edit') && (
        <HistoryForm
          chart={chart}
          item={panel.item}
          onClose={() => setPanel(null)}
          onSaved={(text) => {
            setPanel(null);
            setNotice(text);
            onChanged();
          }}
        />
      )}
      {panel?.type === 'versions' && <VersionsDrawer patientId={chart.patient.id} item={panel.item} onClose={() => setPanel(null)} />}
    </div>
  );
}
