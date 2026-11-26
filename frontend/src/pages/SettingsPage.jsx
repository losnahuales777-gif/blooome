import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useResource } from '../business/hooks/useResource.js';
import { formatDate } from '../models/user.model.js';
import { useAuth } from '../business/auth/useAuth.js';
import { useTheme } from '../business/theme/useTheme.js';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import RoleBadge from '../components/ui/RoleBadge.jsx';
import { ui } from '../components/ui/styles.js';
import { PASSWORD_POLICY } from '../models/auth.model.js';
import { authService } from '../services/auth.service.js';

const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Como el sistema', icon: Monitor },
];

const EMPTY_PASSWORDS = { current: '', next: '', confirm: '' };

function PasswordForm() {
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = {};
    if (!form.current) validation.current = 'Escribe tu contrasena actual';
    if (!PASSWORD_POLICY.test(form.next)) validation.next = 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo';
    if (form.next !== form.confirm) validation.confirm = 'Las contrasenas no coinciden';
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setStatus({ type: '', text: '' });
    try {
      await authService.changePassword(form.current, form.next);
      setForm(EMPTY_PASSWORDS);
      setStatus({ type: 'success', text: 'Contrasena actualizada.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, autoComplete) => (
    <div>
      <label htmlFor={`pw-${name}`} className={ui.label}>
        {label}
      </label>
      <input
        id={`pw-${name}`}
        type="password"
        autoComplete={autoComplete}
        maxLength={128}
        className={ui.input}
        value={form[name]}
        onChange={set(name)}
        aria-invalid={Boolean(errors[name])}
      />
      {errors[name] && <p className={ui.fieldError}>{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Alert variant={status.type || 'info'}>{status.text}</Alert>
      {field('current', 'Contrasena actual', 'current-password')}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('next', 'Nueva contrasena', 'new-password')}
        {field('confirm', 'Confirmar nueva contrasena', 'new-password')}
      </div>
      <button type="submit" className={ui.btnPrimary} disabled={saving}>
        {saving ? 'Guardando...' : 'Cambiar contrasena'}
      </button>
    </form>
  );
}

// Sesiones abiertas de la cuenta (servidor): permite cerrar las de otros dispositivos.
function SessionsCard() {
  const { data, error, reload } = useResource(() => authService.sessions(), []);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const others = (data?.items ?? []).filter((s) => !s.current).length;

  async function revokeOthers() {
    try {
      const r = await authService.revokeOtherSessions();
      setMsg({ type: 'success', text: `Se cerraron ${r.closed} sesion(es).` });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <section className={`${ui.card} p-6`} aria-label="Sesiones activas">
      <h3 className="mb-1 text-lg font-semibold">Sesiones activas</h3>
      <p className="mb-4 text-xs text-muted">
        Las sesiones se cierran solas tras {data?.idleMinutes ?? '—'} minutos sin actividad. Si no reconoces una, cierrala y cambia tu
        contrasena.
      </p>
      <Alert>{error}</Alert>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <ul className="divide-y divide-line text-sm">
        {(data?.items ?? []).map((s) => (
          <li key={s.id} className="py-2">
            <span className="font-medium">{s.current ? 'Esta sesion' : 'Otra sesion'}</span> · iniciada {formatDate(s.createdAt)} · ultima
            actividad {formatDate(s.lastSeenAt)}
            <span className="block truncate text-xs text-muted">
              {s.ip ?? 'IP desconocida'} · {s.userAgent ?? 'navegador desconocido'}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className={`${ui.btnSecondary} mt-3`} disabled={others === 0} onClick={revokeOthers}>
        <LogOut className="size-4" aria-hidden="true" /> Cerrar las otras sesiones ({others})
      </button>
    </section>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { preference, setPreference } = useTheme();

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader title="Configuracion" description="Tu perfil, la apariencia de la plataforma y la seguridad de tu cuenta." />

      <div className={`${ui.card} p-6`}>
        <h3 className="mb-4 text-lg font-semibold">Perfil</h3>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Nombre</dt>
            <dd className="mt-1 font-medium">{user.fullName}</dd>
          </div>
          <div>
            <dt className="text-muted">Correo</dt>
            <dd className="mt-1 font-medium break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Rol</dt>
            <dd className="mt-1">
              <RoleBadge role={user.role} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">Para cambiar tu nombre o correo, pide ayuda a un administrador.</p>
      </div>

      <fieldset className={`${ui.card} p-6`}>
        <legend className="sr-only">Tema</legend>
        <h3 className="mb-4 text-lg font-semibold" aria-hidden="true">
          Apariencia
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-highlight ${
                preference === value ? 'border-accent bg-accent/10 font-semibold' : 'border-line hover:bg-tint'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={preference === value}
                onChange={() => setPreference(value)}
                className="sr-only"
              />
              <Icon className="size-5 text-muted" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`${ui.card} p-6`}>
        <h3 className="mb-1 text-lg font-semibold">Seguridad</h3>
        <p className="mb-4 text-sm text-muted">Cambia tu contrasena periodicamente y no la compartas.</p>
        <PasswordForm />
      </div>
      <SessionsCard />
    </section>
  );
}
