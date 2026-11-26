import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Alert from '../components/ui/Alert.jsx';
import { ui } from '../components/ui/styles.js';
import { PASSWORD_POLICY } from '../models/auth.model.js';
import { authService } from '../services/auth.service.js';

// Activar una cuenta invitada (pacientes) o definir una contrasena nueva tras un restablecimiento.
// El codigo lo entrega el administrador o el nutriologo; es de un solo uso y caduca.
export default function ActivatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', code: '', password: '', confirm: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!PASSWORD_POLICY.test(form.password)) return setMsg({ type: 'error', text: 'La contrasena necesita minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.' });
    if (form.password !== form.confirm) return setMsg({ type: 'error', text: 'Las contrasenas no coinciden.' });
    setBusy(true);
    try {
      const r = await authService.redeem({ email: form.email.trim().toLowerCase(), code: form.code.trim(), password: form.password });
      setMsg({ type: 'success', text: r.activated ? 'Tu cuenta esta activa. Ya puedes iniciar sesion.' : 'Tu contrasena se actualizo. Ya puedes iniciar sesion.' });
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const field = (k, label, type = 'text', extra = {}) => (
    <label htmlFor={`act-${k}`} className="block text-sm">
      <span className={ui.label}>{label}</span>
      <input id={`act-${k}`} type={type} className={ui.input} value={form[k]} onChange={set(k)} required {...extra} />
    </label>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className={`${ui.card} w-full max-w-md space-y-4 p-8`} noValidate>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <KeyRound className="size-6 text-highlight" aria-hidden="true" /> Activar cuenta
        </h1>
        <p className="text-sm text-muted">
          Escribe tu correo y el codigo que te entrego tu nutriologo o el administrador. Sirve para activar tu cuenta o para definir
          una contrasena nueva.
        </p>
        <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
        {field('email', 'Correo', 'email', { maxLength: 254, autoComplete: 'email' })}
        {field('code', 'Codigo', 'text', { maxLength: 20, autoComplete: 'one-time-code', placeholder: 'XXXX-XXXX-XXXX' })}
        {field('password', 'Contrasena nueva', 'password', { maxLength: 128, autoComplete: 'new-password' })}
        {field('confirm', 'Confirma la contrasena', 'password', { maxLength: 128, autoComplete: 'new-password' })}
        <button type="submit" className={`${ui.btnPrimary} w-full`} disabled={busy}>
          {busy ? 'Validando...' : 'Activar'}
        </button>
        <Link to="/login" className="block text-center text-sm text-muted hover:underline">
          Volver al inicio de sesion
        </Link>
      </form>
    </main>
  );
}
