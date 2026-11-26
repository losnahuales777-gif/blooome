import { ArrowRightLeft, Clock, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import RoleBadge from '../components/ui/RoleBadge.jsx';
import { ui } from '../components/ui/styles.js';
import { fmt } from '../models/analysis.model.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { accessService } from '../services/access.service.js';
import { usersService } from '../services/users.service.js';

function UserSelect({ id, label, users, value, onChange, exclude }) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <select id={id} className={ui.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecciona un usuario...</option>
        {users
          .filter((u) => String(u.id) !== String(exclude))
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.email}){u.isActive ? '' : ' - inactivo'}
            </option>
          ))}
      </select>
    </div>
  );
}

// Acceso temporal (1 a 72 h) con justificacion; es la unica via para dar un permiso clinico a un perfil
// administrativo. Vence solo y queda en la auditoria.
function TemporaryGrant({ userId, access, catalog, onSaved }) {
  const options = catalog.permissions.filter((p) => p.isDelegable && !access.rolePermissions.includes(p.code));
  const [form, setForm] = useState({ permission: options[0]?.code ?? '', justification: '', hours: 8 });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function grant(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await usersService.grantTemporary(userId, { permission: form.permission, justification: form.justification.trim(), hours: Number(form.hours) });
      setForm((f) => ({ ...f, justification: '' }));
      setMessage({ type: 'success', text: 'Acceso temporal otorgado; quedo registrado en la auditoria.' });
      onSaved(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.details?.map((d) => d.message).join('. ') || err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={grant} className="space-y-3 rounded-lg border border-line p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="size-4 text-highlight" aria-hidden="true" /> Acceso temporal
      </h4>
      <Alert variant={message.type || 'info'}>{message.text}</Alert>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="block text-sm">
          <span className={ui.label}>Permiso</span>
          <select className={ui.input} value={form.permission} onChange={set('permission')}>
            {options.map((p) => (
              <option key={p.code} value={p.code}>
                {p.description}
                {p.clinical ? ' (clinico)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className={ui.label}>Horas (1-72)</span>
          <input type="number" min={1} max={72} className={ui.input} value={form.hours} onChange={set('hours')} />
        </label>
      </div>
      <label className="block text-sm">
        <span className={ui.label}>Justificacion (minimo 20 caracteres)</span>
        <textarea className={ui.input} rows={2} maxLength={500} value={form.justification} onChange={set('justification')} />
      </label>
      <button type="submit" className={ui.btnSecondary} disabled={saving || !form.permission || form.justification.trim().length < 20}>
        {saving ? 'Otorgando...' : 'Otorgar acceso temporal'}
      </button>
      {access.temporary?.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {access.temporary.map((t, i) => (
            <li key={i} className="py-2">
              <span className="font-mono text-xs">{t.permission}</span> · {t.active ? `vence ${fmt.dateTime(t.expiresAt)}` : 'vencido'}
              <span className="block text-xs text-muted">{t.justification}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function DirectPermissions({ users, catalog, meId }) {
  const [userId, setUserId] = useState('');
  const [access, setAccess] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccess(null);
    setMessage({ type: '', text: '' });
    if (!userId) return;
    let active = true;
    usersService
      .getPermissions(userId)
      .then((data) => {
        if (!active) return;
        setAccess(data);
        setSelected(new Set(data.directPermissions));
      })
      .catch((err) => active && setMessage({ type: 'error', text: err.message }));
    return () => {
      active = false;
    };
  }, [userId]);

  function toggle(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const data = await usersService.setPermissions(userId, [...selected]);
      setAccess(data);
      setMessage({ type: 'success', text: 'Permisos actualizados' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const isSuperuser = access?.user.role === 'superuser';
  const fromRole = new Set(access?.rolePermissions);

  return (
    <div className={`${ui.card} space-y-4 p-5`}>
      <div>
        <h3 className="font-medium text-ink">Permisos directos</h3>
        <p className="text-sm text-muted">
          Otorga permisos adicionales a los de su rol. Los permisos de gobierno son exclusivos del super usuario.
        </p>
      </div>

      <UserSelect id="perm-user" label="Usuario" users={users} value={userId} onChange={setUserId} exclude={meId} />
      <Alert variant={message.type || 'info'}>{message.text}</Alert>

      {access && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted">
            Rol actual: <RoleBadge role={access.user.role} />
          </div>
          {isSuperuser ? (
            <Alert variant="info">El super usuario ya cuenta con todos los permisos.</Alert>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {catalog.permissions.map((p) => {
                const inherited = fromRole.has(p.code);
                const disabled = inherited || !p.isDelegable;
                return (
                  <li key={p.code} className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      id={`perm-${p.code}`}
                      type="checkbox"
                      className="size-4 accent-accent"
                      checked={inherited || selected.has(p.code)}
                      disabled={disabled}
                      onChange={() => toggle(p.code)}
                    />
                    <label htmlFor={`perm-${p.code}`} className="flex-1 text-sm text-ink">
                      {p.description}
                      <span className="ml-2 font-mono text-xs text-muted">{p.code}</span>
                    </label>
                    {inherited && <span className="text-xs text-muted">Por rol</span>}
                    {!inherited && !p.isDelegable && <span className="text-xs text-muted">Solo super usuario</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {!isSuperuser && (
            <button type="button" className={ui.btnPrimary} onClick={save} disabled={saving}>
              <Save className="size-4" aria-hidden="true" /> {saving ? 'Guardando...' : 'Guardar permisos'}
            </button>
          )}
          {!isSuperuser && access.user.role !== 'paciente' && (
            <TemporaryGrant key={userId} userId={userId} access={access} catalog={catalog} onSaved={setAccess} />
          )}
        </>
      )}
    </div>
  );
}

function TransferSystems({ users, meId, onDone }) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [deactivateSource, setDeactivateSource] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [running, setRunning] = useState(false);

  const source = users.find((u) => String(u.id) === sourceId);
  const target = users.find((u) => String(u.id) === targetId);
  const activeTargets = users.filter((u) => u.isActive);

  async function handleTransfer() {
    const confirmed = window.confirm(
      `Se transferiran los pacientes, registros y permisos directos de ${source.fullName} a ${target.fullName}` +
        `${deactivateSource ? ' y se desactivara la cuenta de origen' : ''}. ¿Continuar?`,
    );
    if (!confirmed) return;

    setRunning(true);
    try {
      const r = await usersService.transfer(sourceId, targetId, deactivateSource);
      setMessage({
        type: 'success',
        text: `Herencia completada: ${r.patientsTransferred} pacientes, ${r.recordsTransferred} registros y ${r.permissionsTransferred} permisos transferidos.`,
      });
      setSourceId('');
      setTargetId('');
      onDone();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={`${ui.card} space-y-4 p-5`}>
      <div>
        <h3 className="font-medium text-ink">Heredar sistemas</h3>
        <p className="text-sm text-muted">
          Transfiere los pacientes, registros y permisos directos de un usuario a otro (por ejemplo, ante una baja o cambio de
          puesto). La operacion queda registrada en auditoria.
        </p>
      </div>
      <Alert variant={message.type || 'info'}>{message.text}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <UserSelect id="src-user" label="Usuario origen" users={users} value={sourceId} onChange={setSourceId} />
        <UserSelect
          id="dst-user"
          label="Usuario destino"
          users={activeTargets}
          value={targetId}
          onChange={setTargetId}
          exclude={sourceId}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={deactivateSource}
          disabled={sourceId === String(meId)}
          onChange={(e) => setDeactivateSource(e.target.checked)}
        />
        Desactivar la cuenta de origen al terminar
      </label>
      <button
        type="button"
        className={ui.btnDanger}
        disabled={!source || !target || running || (deactivateSource && sourceId === String(meId))}
        onClick={handleTransfer}
      >
        <ArrowRightLeft className="size-4" aria-hidden="true" /> {running ? 'Transfiriendo...' : 'Heredar sistemas'}
      </button>
    </div>
  );
}

export default function AccessPage() {
  const { user: me, hasPermission } = useAuth();
  const users = useResource(() => usersService.list({ page: 1, pageSize: 100 }), []);
  const catalog = useResource(() => accessService.catalog(), []);
  const error = users.error || catalog.error;

  return (
    <section className="space-y-6">
      <PageHeader title="Permisos y accesos" description="Gobierno de accesos de la plataforma." />
      <Alert>{error}</Alert>
      {users.data && catalog.data && (
        <>
          <DirectPermissions users={users.data.items} catalog={catalog.data} meId={me.id} />
          {hasPermission(P.SYSTEMS_TRANSFER) && (
            <TransferSystems users={users.data.items} meId={me.id} onDone={users.reload} />
          )}
        </>
      )}
    </section>
  );
}
