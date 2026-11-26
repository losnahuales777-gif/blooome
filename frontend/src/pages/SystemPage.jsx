import { DatabaseBackup, HardDrive, Power, ServerCog, ShieldAlert, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import { invalidateSystemConfig } from '../business/system/useSystemConfig.js';
import { KpiCard } from '../components/charts/ChartParts.jsx';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { fmt } from '../models/analysis.model.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { systemService } from '../services/admin.service.js';

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className={`${ui.card} space-y-4 p-6`}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-5 text-highlight" aria-hidden="true" /> {title}
        </h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Health() {
  const h = useResource(() => systemService.health(), []);
  const errors = useResource(() => systemService.errors(), []);
  const d = h.data;
  return (
    <Section icon={ServerCog} title="Funcionamiento" description="Metricas tecnicas; no incluye contenido de los expedientes.">
      <Alert>{h.error}</Alert>
      {d && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Estado" value={d.status === 'ok' ? 'En linea' : d.status} tone="accent" />
          <KpiCard label="Latencia de la base" value={d.dbPingMs} unit="ms" />
          <KpiCard label="Errores (24 h)" value={d.errors24h} />
          <KpiCard label="Sesiones activas" value={d.activeSessions} />
          <KpiCard label="Memoria" value={d.memoryMb} unit="MB" hint={`Node ${d.node} · ${Math.round(d.uptimeSeconds / 60)} min en linea`} />
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Errores tecnicos recientes ({errors.data?.items.length ?? 0})</summary>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr>
              <th className={ui.th}>Fecha</th>
              <th className={ui.th}>Ruta</th>
              <th className={ui.th}>Tipo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(errors.data?.items ?? []).map((e, i) => (
              <tr key={i}>
                <td className={ui.td}>{fmt.dateTime(e.at)}</td>
                <td className={`${ui.td} font-mono text-xs`}>
                  {e.method} {e.route}
                </td>
                <td className={ui.td}>{e.errorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Section>
  );
}

function Backups() {
  const { data, error, reload } = useResource(() => systemService.backups(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  async function create() {
    setBusy(true);
    try {
      const r = await systemService.createBackup();
      setMsg({ type: 'success', text: `Respaldo creado: ${r.file}` });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section icon={DatabaseBackup} title="Respaldos" description="Copias cifradas en backend/backups. Guardalas tambien fuera del servidor.">
      <Alert>{error}</Alert>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <button type="button" className={ui.btnPrimary} disabled={busy} onClick={create}>
        <HardDrive className="size-4" aria-hidden="true" /> {busy ? 'Respaldando...' : 'Crear respaldo ahora'}
      </button>
      <ul className="divide-y divide-line text-sm">
        {(data?.items ?? []).map((b) => (
          <li key={b.file} className="py-2">
            <span className="font-mono text-xs">{b.file}</span>
            <span className="block text-xs text-muted">
              {fmt.dateTime(b.createdAt)} · {b.documents} documentos · huella {b.sha256.slice(0, 12)}…
            </span>
          </li>
        ))}
        {data?.items.length === 0 && <li className="py-2 text-muted">Aun no hay respaldos.</li>}
      </ul>
    </Section>
  );
}

function Settings({ can }) {
  const { data, error, reload } = useResource(() => systemService.settings(), []);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [maintenance, setMaintenance] = useState(null);
  const [security, setSecurity] = useState(null);
  const save = async (fn, text) => {
    try {
      await fn();
      invalidateSystemConfig();
      setMsg({ type: 'success', text });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.details?.map((d) => d.message).join('. ') || err.message });
    }
  };
  if (!data) return <Alert>{error}</Alert>;
  const sec = security ?? data.security;
  return (
    <>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      {can(P.MODULES_MANAGE) && (
        <Section icon={Power} title="Modulos" description="Un modulo desactivado se bloquea en el servidor para todos los usuarios.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(data.moduleNames).map(([k, label]) => (
              <li key={k}>
                <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <input type="checkbox" checked={data.modules[k] !== false} onChange={(e) => save(() => systemService.updateModules({ [k]: e.target.checked }), 'Modulos actualizados.')} />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {can(P.SECURITY_SETTINGS) && sec && (
        <Section icon={ShieldAlert} title="Seguridad" description="Cada cambio queda en la auditoria con el valor anterior.">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['sessionIdleMinutes', 'Cierre por inactividad (min)', 5, 480],
              ['loginMaxAttempts', 'Intentos antes de bloquear', 3, 20],
              ['loginLockMinutes', 'Bloqueo de cuenta (min)', 5, 1440],
            ].map(([k, label, min, max]) => (
              <label key={k} className="block text-sm">
                <span className={ui.label}>{label}</span>
                <input type="number" min={min} max={max} className={ui.input} value={sec[k]} onChange={(e) => setSecurity({ ...sec, [k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <input type="checkbox" className="mt-1" checked={sec.aiRequiresConsent !== false} onChange={(e) => setSecurity({ ...sec, aiRequiresConsent: e.target.checked })} />
            <span>
              Exigir el consentimiento registrado del paciente para usar el asistente de IA
              <span className="block text-xs text-muted">
                Si lo desactivas, nutriologos y administradores usan la IA sin registrar el consentimiento. Una negativa o revocacion del
                paciente siempre bloquea el asistente.
              </span>
            </span>
          </label>
          <button type="button" className={ui.btnPrimary} disabled={!security} onClick={() => save(() => systemService.updateSecurity(sec), 'Parametros de seguridad guardados.')}>
            Guardar seguridad
          </button>
        </Section>
      )}
      {can(P.SYSTEM_SETTINGS) && (
        <Section icon={Wrench} title="Parametros tecnicos">
          <label className="block text-sm">
            <span className={ui.label}>Aviso de mantenimiento (visible para todos; vacio = sin aviso)</span>
            <input className={ui.input} maxLength={300} value={maintenance ?? data.technical.maintenanceMessage} onChange={(e) => setMaintenance(e.target.value)} />
          </label>
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={maintenance === null}
            onClick={() => save(() => systemService.updateTechnical({ maintenanceMessage: maintenance.trim() }), 'Parametros tecnicos guardados.')}
          >
            Guardar
          </button>
        </Section>
      )}
    </>
  );
}

// Panel de sistema: cada seccion aparece segun los permisos del usuario (Sistemas, superusuario).
export default function SystemPage() {
  const { hasPermission } = useAuth();
  return (
    <section className="space-y-6">
      <PageHeader title="Sistema" description="Supervision tecnica, respaldos y configuracion del aplicativo." />
      {hasPermission(P.SYSTEM_HEALTH) && <Health />}
      {hasPermission(P.SYSTEM_BACKUPS) && <Backups />}
      {[P.SYSTEM_SETTINGS, P.MODULES_MANAGE, P.SECURITY_SETTINGS].some((p) => hasPermission(p)) && <Settings can={hasPermission} />}
    </section>
  );
}
