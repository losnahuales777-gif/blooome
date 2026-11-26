import { ArrowRight, Eye, EyeOff, HeartPulse, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import mascot from '../assets/brand/nutria-mascota.webp';
import { useAuth } from '../business/auth/useAuth.js';
import { loadRememberedEmail, saveRememberedEmail } from '../business/auth/rememberEmail.js';
import { useMediaQuery } from '../business/hooks/useMediaQuery.js';
import Logo, { LeafShape } from '../components/brand/Logo.jsx';
import LoginReplica from '../components/login/LoginReplica.jsx';
import { normalizeCredentials, validateCredentials } from '../models/auth.model.js';

// El login reproduce el diseno de marca: siempre en verdes oscuros, sin depender del tema elegido.

// Las cuentas las crea un administrador (RBAC): no hay registro publico ni recuperacion por correo.
const NOTICES = {
  forgot: 'Pide a un administrador de Bloome un código de restablecimiento y úsalo en "Regístrate" para definir tu contraseña nueva.',
};

function BackgroundWaves() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 800 533"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wave-light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E9D74" />
          <stop offset="1" stopColor="#145C46" />
        </linearGradient>
        <linearGradient id="wave-dark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E7A5D" />
          <stop offset="1" stopColor="#0B3D2E" />
        </linearGradient>
      </defs>
      <rect width="800" height="533" fill="#06251C" />
      {/* Esquina superior izquierda */}
      <path d="M0 0 H200 C170 55 110 80 55 105 C30 116 12 132 0 150 Z" fill="url(#wave-dark)" opacity="0.85" />
      <path d="M0 0 H130 C110 38 70 58 0 80 Z" fill="url(#wave-light)" opacity="0.9" />
      {/* Esquina superior derecha */}
      <path d="M610 0 H800 V140 C770 110 730 95 700 70 C670 45 640 20 610 0 Z" fill="url(#wave-dark)" opacity="0.7" />
      {/* Esquina inferior derecha */}
      <path d="M800 250 C760 300 720 330 700 400 C685 455 650 500 610 533 H800 Z" fill="url(#wave-dark)" opacity="0.85" />
      <path d="M800 390 C760 420 720 450 700 533 H800 Z" fill="url(#wave-light)" opacity="0.9" />
      {/* Esquina inferior izquierda */}
      <path d="M0 430 C45 440 85 480 100 533 H0 Z" fill="url(#wave-dark)" opacity="0.8" />
    </svg>
  );
}

function BrandPanel() {
  return (
    <div className="absolute inset-y-0 left-0 hidden w-[56%] overflow-hidden rounded-l-[2.4rem] md:block" aria-hidden="false">
      {/* Arco claro detras de la mascota */}
      <div
        className="absolute top-[3%] right-[2%] bottom-0 left-0 rounded-tr-[48%] rounded-tl-[2.4rem]"
        style={{ background: 'radial-gradient(85% 70% at 48% 32%, #2E9D74 0%, #1E7A5D 35%, #145C46 65%, #0B3D2E 100%)' }}
      />

      {/* Follaje inferior */}
      <svg className="absolute inset-x-0 bottom-0 h-[38%] w-full" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-20 200 C40 110 120 90 170 120 C150 150 120 175 110 200 Z" fill="#145C46" />
        <path d="M140 200 C190 120 280 100 340 130 C300 150 270 180 260 200 Z" fill="#0F4A38" />
        <path d="M260 200 C300 150 360 140 420 160 V200 Z" fill="#145C46" />
        <path d="M-20 140 C30 150 70 175 80 200 H-20 Z" fill="#0B3D2E" />
      </svg>

      {/* Decoracion */}
      <LeafShape className="absolute top-[13%] left-[6%] h-[13%] -rotate-12" gradientId="panel-leaf-1" />
      <LeafShape className="absolute top-[33%] right-[5%] z-10 h-[10%] rotate-[25deg]" gradientId="panel-leaf-2" />
      <LeafShape className="absolute top-[63%] right-[6%] z-10 h-[10%] rotate-[35deg]" gradientId="panel-leaf-3" />
      <HeartPulse className="absolute top-[13%] right-[9%] z-10 size-[4.2rem] text-[#7FCBA4]" strokeWidth={1.2} aria-hidden="true" />

      <img
        src={mascot}
        alt="Nutria con bata de nutrióloga sosteniendo una manzana verde"
        className="absolute top-[6%] left-[-5%] w-[114%] max-w-none drop-shadow-[0_20px_40px_rgb(0_0_0/0.35)]"
      />

      <div
        className="absolute inset-x-0 bottom-0 h-[34%]"
        style={{ background: 'linear-gradient(to top, rgb(11 61 46 / 0.95) 25%, transparent)' }}
        aria-hidden="true"
      />
      <p className="absolute bottom-[8%] left-[7%] text-[2.75rem] leading-[1.12] font-bold tracking-tight text-[#F2FAF6]">
        Cuida tu salud,
        <br />
        <span className="text-[#8FD3B0]">vive mejor.</span>
      </p>
    </div>
  );
}

function Notice({ tone, children }) {
  if (!children) return null;
  const styles = tone === 'error' ? 'border-[#F19A9A]/35 bg-[#F19A9A]/10 text-[#F7C2C2]' : 'border-[#8FD3B0]/35 bg-[#8FD3B0]/10 text-[#CDEBDD]';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(() => ({ email: loadRememberedEmail(), password: '' }));
  const [remember, setRemember] = useState(() => Boolean(loadRememberedEmail()));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px) and (min-height: 460px)');

  function showNotice(text) {
    setErrors({});
    setServerError('');
    setNotice(text);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');
    setNotice('');

    const validation = validateCredentials(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      await login(form);
      saveRememberedEmail(normalizeCredentials(form).email, remember);
      // Solo se aceptan rutas internas para evitar redirecciones abiertas.
      const from = location.state?.from;
      navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/', {
        replace: true,
      });
    } catch (err) {
      setServerError(err.message);
      setForm((prev) => ({ ...prev, password: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  // Escritorio: replica exacta del diseno. Pantallas pequenas: version adaptable (la imagen no seria legible).
  if (isDesktop) {
    const firstError = errors.email ?? errors.password;
    const message = serverError || firstError ? { tone: 'error', text: serverError || firstError } : { tone: 'info', text: notice };
    return (
      <LoginReplica
        form={form}
        errors={errors}
        remember={remember}
        showPassword={showPassword}
        submitting={submitting}
        message={message}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onRememberChange={setRemember}
        onTogglePassword={() => setShowPassword((v) => !v)}
        onForgot={() => showNotice(NOTICES.forgot)}
        onRegister={() => navigate('/activar')}
      />
    );
  }

  const fieldClass = (field) =>
    `block h-[52px] w-full rounded-2xl border bg-[#0B3D2E]/55 pr-12 pl-12 text-[15px] text-[#EAF6F0] outline-none backdrop-blur transition placeholder:text-[#A7D6C0]/70 focus:ring-2 ${
      errors[field]
        ? 'border-[#F19A9A]/70 focus:ring-[#F19A9A]/25'
        : 'border-[#A7D6C0]/20 focus:border-[#8FD3B0]/70 focus:ring-[#8FD3B0]/20'
    }`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 text-[#EAF6F0] sm:p-8">
      <BackgroundWaves />
      <LeafShape className="pointer-events-none absolute top-[9%] right-[4%] h-16 rotate-[40deg] opacity-90" gradientId="bg-leaf-1" />
      <LeafShape className="pointer-events-none absolute bottom-[5%] left-[3%] h-12 rotate-[-30deg] opacity-80" gradientId="bg-leaf-2" />

      <div
        className="relative w-full max-w-[1140px] rounded-[2.5rem] border border-[#EAF6F0]/15 bg-[#0B3D2E]/40 shadow-[0_40px_100px_rgb(0_0_0/0.45)] backdrop-blur-xl md:aspect-[650/400]"
        style={{ boxShadow: 'inset 0 1px 0 rgb(234 246 240 / 0.12), 0 40px 100px rgb(0 0 0 / 0.45)' }}
      >
        <BrandPanel />

        <div className="flex h-full flex-col justify-center px-6 py-10 md:ml-[56%] md:px-[5%] md:py-6">
          <div className="mx-auto w-full max-w-[460px]">
            <Logo />

            <div className="mt-8 mb-6 text-center">
              <h1 className="text-[1.9rem] font-semibold">Bienvenido/a</h1>
              <p className="mt-1 text-[15px] text-[#EAF6F0]/85">Inicia sesión para acceder a tu cuenta</p>
            </div>

            <div className="mb-4 space-y-2 empty:hidden">
              <Notice tone="error">{serverError}</Notice>
              <Notice tone="info">{notice}</Notice>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-[#8FD3B0]" aria-hidden="true" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Correo electrónico"
                    maxLength={254}
                    value={form.email}
                    onChange={handleChange}
                    className={fieldClass('email')}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                </div>
                {errors.email && (
                  <p id="email-error" className="mt-1 text-xs text-[#F7C2C2]">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-[#8FD3B0]" aria-hidden="true" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Contraseña"
                    maxLength={128}
                    value={form.password}
                    onChange={handleChange}
                    className={fieldClass('password')}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 z-10 flex items-center px-4 text-[#A7D6C0] hover:text-[#EAF6F0]"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-xs text-[#F7C2C2]">
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                <label className="flex cursor-pointer items-center gap-2.5 text-[#EAF6F0]/90">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-[18px] cursor-pointer appearance-none rounded-[5px] border-2 border-[#EAF6F0]/70 bg-transparent bg-center bg-no-repeat checked:border-[#8FD3B0] checked:bg-[#8FD3B0] checked:bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22><path%20d=%22M3.5%208.5l3%203%206-7%22%20fill=%22none%22%20stroke=%22%230B3D2E%22%20stroke-width=%222.2%22/></svg>')]"
                  />
                  Recordarme
                </label>
                <button type="button" onClick={() => showNotice(NOTICES.forgot)} className="text-[#8FD3B0] hover:underline">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl text-[17px] font-semibold text-[#0B3D2E] shadow-[0_10px_30px_rgb(0_0_0/0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: 'linear-gradient(180deg, #A0DCBC 0%, #7CC6A0 100%)' }}
              >
                {submitting ? 'Verificando...' : 'Iniciar sesión'}
                {!submitting && <ArrowRight className="size-5" aria-hidden="true" />}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 text-sm text-[#EAF6F0]/80" aria-hidden="true">
              <span className="h-px flex-1 bg-[#EAF6F0]/25" />o continúa con
              <span className="h-px flex-1 bg-[#EAF6F0]/25" />
            </div>

            <p className="mt-5 text-center text-[15px] text-[#EAF6F0]/90">
              ¿No tienes una cuenta?{' '}
              <button type="button" onClick={() => navigate('/activar')} className="font-semibold text-[#8FD3B0] hover:underline">
                Regístrate
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
