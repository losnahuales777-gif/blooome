import { History, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useResource } from '../business/hooks/useResource.js';
import { FormDrawer } from '../components/analysis/AnalysisForms.jsx';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import Drawer from '../components/ui/Drawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { fmt } from '../models/analysis.model.js';
import { ALERT_PRIORITY } from '../models/chart.model.js';
import { alertsService } from '../services/chart.service.js';

// Campos de parametros de cada tipo de regla. Las clinicas no traen valores sugeridos.
const PARAM_FIELDS = {
  seguimiento_pendiente: [{ key: 'overdueDays', label: 'Dias de vencimiento', type: 'int', min: 0, max: 365 }],
  consulta_no_realizada: [{ key: 'days', label: 'Considerar cancelaciones de los ultimos (dias)', type: 'int', min: 0, max: 365 }],
  objetivo_sin_revision: [{ key: 'graceDays', label: 'Dias de gracia tras la fecha meta', type: 'int', min: 0, max: 365 }],
  nota_sin_firmar: [{ key: 'hours', label: 'Horas en borrador', type: 'int', min: 1, max: 1440 }],
  cambio_antropometrico: [
    {
      key: 'field',
      label: 'Medida',
      type: 'select',
      options: [
        ['weightKg', 'Peso (kg)'],
        ['waistCm', 'Cintura (cm)'],
        ['hipCm', 'Cadera (cm)'],
        ['bodyFatPct', 'Grasa corporal (%)'],
      ],
    },
    { key: 'pctChange', label: 'Cambio minimo (%)', type: 'number', min: 0.5, max: 100 },
    { key: 'windowDays', label: 'Ventana (dias)', type: 'int', min: 1, max: 365 },
  ],
  laboratorio_fuera_rango: [
    { key: 'analyte', label: 'Estudio (nombre exacto como se captura)', type: 'text' },
    { key: 'unit', label: 'Unidad (debe coincidir)', type: 'text' },
    { key: 'min', label: 'Limite inferior (opcional)', type: 'number', optional: true },
    { key: 'max', label: 'Limite superior (opcional)', type: 'number', optional: true },
  ],
  interaccion_revision: [
    { key: 'termsA', label: 'Terminos del grupo A (separados por coma)', type: 'list' },
    { key: 'termsB', label: 'Terminos del grupo B (separados por coma)', type: 'list' },
  ],
};

const toForm = (fields, params = {}) =>
  Object.fromEntries((fields ?? []).map((f) => [f.key, f.type === 'list' ? (params[f.key] ?? []).join(', ') : (params[f.key] ?? f.options?.[0]?.[0] ?? '')]));

function toParams(fields = [], form) {
  const out = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.type === 'list') out[f.key] = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    else if (f.type === 'int' || f.type === 'number') out[f.key] = v === '' ? (f.optional ? null : NaN) : Number(v);
    else out[f.key] = String(v).trim();
  }
  return out;
}

function paramSummary(rule) {
  const p = rule.params ?? {};
  switch (rule.type) {
    case 'cambio_antropometrico':
      return `${p.field}: ${p.pctChange} % en ${p.windowDays} dias`;
    case 'laboratorio_fuera_rango':
      return `${p.analyte}: ${p.min ?? '—'} a ${p.max ?? '—'} ${p.unit}`;
    case 'interaccion_revision':
      return `${(p.termsA ?? []).join(', ')} ↔ ${(p.termsB ?? []).join(', ')}`;
    default:
      return (
        Object.entries(p)
          .map(([k, v]) => `${PARAM_FIELDS[rule.type]?.find((f) => f.key === k)?.label ?? k}: ${v}`)
          .join(', ') || '—'
      );
  }
}

function RuleForm({ types, rule, onClose, onSaved }) {
  const [type, setType] = useState(rule?.type ?? 'cambio_antropometrico');
  const fields = PARAM_FIELDS[type] ?? [];
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    priority: rule?.priority ?? 'media',
    enabled: rule?.enabled ?? false,
    validationReference: rule?.validation?.reference ?? '',
    ...toForm(fields, rule?.params),
  });
  const clinical = types[type]?.kind === 'clinica';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!rule) setForm((f) => ({ ...f, ...toForm(PARAM_FIELDS[type]) }));
  }, [type, rule]);

  return (
    <FormDrawer
      title={rule ? 'Editar regla' : 'Nueva regla'}
      submitLabel="Guardar regla"
      onClose={onClose}
      onSubmit={async () => {
        const params = toParams(fields, form);
        const base = { name: form.name.trim(), priority: form.priority, enabled: form.enabled, params };
        const ref = form.validationReference.trim();
        if (rule) {
          await alertsService.updateRule(rule.id, {
            expectedVersion: rule.version,
            ...base,
            ...(ref && ref !== rule.validation?.reference && { validationReference: ref }),
          });
        } else {
          await alertsService.createRule({ type, ...base, ...(ref && { validationReference: ref }) });
        }
        onSaved();
      }}
    >
      {!rule && (
        <div>
          <label htmlFor="ar-type" className={ui.label}>
            Tipo de regla
          </label>
          <select id="ar-type" className={ui.input} value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} ({v.kind})
              </option>
            ))}
          </select>
        </div>
      )}
      {clinical && (
        <Alert variant="info">
          Regla clinica: el sistema no sugiere umbrales. Usa valores de un protocolo o guia validados por tu institucion y registra esa
          referencia; sin ella la regla no puede activarse.
        </Alert>
      )}
      <div>
        <label htmlFor="ar-name" className={ui.label}>
          Nombre
        </label>
        <input id="ar-name" className={ui.input} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ar-priority" className={ui.label}>
            Prioridad
          </label>
          <select id="ar-priority" className={ui.input} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <label className="mt-7 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Regla activa
        </label>
      </div>
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`ar-${f.key}`} className={ui.label}>
            {f.label}
          </label>
          {f.type === 'select' ? (
            <select id={`ar-${f.key}`} className={ui.input} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>
              {f.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`ar-${f.key}`}
              className={ui.input}
              type={f.type === 'int' || f.type === 'number' ? 'number' : 'text'}
              step={f.type === 'int' ? '1' : 'any'}
              min={f.min}
              max={f.max}
              value={form[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <div>
        <label htmlFor="ar-ref" className={ui.label}>
          Referencia clinica que valida la regla {clinical ? '(obligatoria para activarla)' : '(opcional)'}
        </label>
        <textarea
          id="ar-ref"
          rows={2}
          maxLength={300}
          className={ui.input}
          placeholder="Protocolo, guia o acuerdo clinico y responsable"
          value={form.validationReference}
          onChange={(e) => set('validationReference', e.target.value)}
        />
      </div>
    </FormDrawer>
  );
}

function VersionsDrawer({ rule, onClose }) {
  const { data, error } = useResource(() => alertsService.ruleVersions(rule.id), [rule.id]);
  return (
    <Drawer title={`Versiones: ${rule.name}`} onClose={onClose}>
      <Alert>{error}</Alert>
      <ol className="space-y-2 text-sm">
        {(data?.items ?? []).map((v) => (
          <li key={v.version} className="rounded-xl bg-tint px-4 py-2">
            <span className="font-medium">v{v.version}</span> · {fmt.dateTime(v.savedAt)} · {v.rule.enabled ? 'activa' : 'inactiva'} · prioridad{' '}
            {v.rule.priority}
            <span className="block text-xs text-muted">{paramSummary(v.rule)}</span>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}

export default function AlertRulesPage() {
  const { data, error, loading, reload } = useResource(() => alertsService.rules(), []);
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState('');
  const types = data?.types ?? {};

  const columns = [
    { key: 'name', label: 'Regla', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'typeLabel', label: 'Tipo' },
    { key: 'kind', label: 'Clase', render: (r) => <StatusBadge tone={r.kind === 'clinica' ? 'info' : 'neutral'}>{r.kind}</StatusBadge> },
    { key: 'priority', label: 'Prioridad', render: (r) => <StatusBadge tone={ALERT_PRIORITY[r.priority]?.tone}>{r.priority}</StatusBadge> },
    { key: 'enabled', label: 'Estado', sortValue: (r) => (r.enabled ? 1 : 0), render: (r) => <StatusBadge tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'Activa' : 'Inactiva'}</StatusBadge> },
    { key: 'params', label: 'Parametros', sortable: false, render: (r) => <span className="text-xs">{paramSummary(r)}</span> },
    { key: 'validation', label: 'Referencia', sortable: false, render: (r) => <span className="text-xs">{r.validation?.reference ?? '—'}</span> },
    {
      key: 'actions',
      label: '',
      sortable: false,
      searchable: false,
      render: (r) => (
        <span className="flex gap-1">
          <button type="button" className="rounded-md p-1.5 text-muted hover:bg-tint-strong" aria-label={`Editar ${r.name}`} onClick={() => setPanel({ type: 'edit', rule: r })}>
            <Pencil className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1.5 text-muted hover:bg-tint-strong" aria-label={`Versiones de ${r.name}`} onClick={() => setPanel({ type: 'versions', rule: r })}>
            <History className="size-4" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Reglas de alertas"
        description="Las alertas senalan registros que conviene revisar; no son diagnosticos. La prioridad la decide cada regla."
        actions={
          <button type="button" className={ui.btnPrimary} onClick={() => setPanel({ type: 'new' })}>
            <Plus className="size-4" aria-hidden="true" /> Nueva regla
          </button>
        }
      />
      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'enabled', dir: 'desc' }} searchPlaceholder="Buscar regla" />
      {(panel?.type === 'new' || panel?.type === 'edit') && (
        <RuleForm
          types={types}
          rule={panel.rule}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setNotice('Regla guardada; el cambio queda versionado.');
            reload();
          }}
        />
      )}
      {panel?.type === 'versions' && <VersionsDrawer rule={panel.rule} onClose={() => setPanel(null)} />}
    </section>
  );
}
