import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
// Version de la referencia con la marca Bloome (solo cambia el nombre y el eslogan; el resto es identico).
import reference from '../../assets/brand/login-bloome.png';

// Replica exacta del diseno de login: la imagen de referencia (800x533) es la base visual y encima
// se colocan los controles reales en las mismas coordenadas. Todo se mide en pixeles de la imagen
// y se convierte a porcentaje, asi la composicion escala sin moverse.
const W = 800;
const H = 533;

function box(x0, y0, x1, y1) {
  return {
    left: `${(x0 / W) * 100}%`,
    top: `${(y0 / H) * 100}%`,
    width: `${((x1 - x0) / W) * 100}%`,
    height: `${((y1 - y0) / H) * 100}%`,
  };
}

// 1 px de la imagen = 0.125cqw (el escenario es un contenedor de 800 "px" de ancho).
const px = (n) => `${n * 0.125}cqw`;

const FIELD_STYLE = {
  backgroundColor: '#18312D',
  border: `${px(1)} solid #2F4742`,
  borderRadius: px(10),
};

function Field({ area, icon: Icon, iconArea, error, children }) {
  return (
    <div className="absolute" style={{ ...box(...area), ...FIELD_STYLE, ...(error && { borderColor: '#E58C8C' }) }}>
      <Icon
        className="pointer-events-none absolute text-[#A4C3B4]"
        style={{
          left: px(iconArea[0] - area[0]),
          top: px(iconArea[1] - area[1]),
          width: px(iconArea[2] - iconArea[0] + 1),
          height: px(iconArea[3] - iconArea[1] + 1),
        }}
        strokeWidth={2}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

const inputClass =
  'absolute inset-0 h-full w-full rounded-[inherit] bg-transparent text-[#EAF6F0] outline-none placeholder:text-[#EAF6F0]/45 focus:shadow-[0_0_0_0.25cqw_rgb(143_211_176/0.35)]';

export default function LoginReplica({
  form,
  errors,
  remember,
  showPassword,
  submitting,
  message,
  onChange,
  onSubmit,
  onRememberChange,
  onTogglePassword,
  onForgot,
  onRegister,
}) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#051A15]">
      {/* Escenario en modo "cover": la imagen ocupa el 100% del contenedor (alto y ancho) sin franjas
          laterales; lo que sobra se recorta por igual en los bordes. Los controles viven dentro del
          escenario, asi que siguen alineados con el dibujo a cualquier tamano. */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:inline-size]"
        style={{ width: `max(100%, calc(100dvh * ${W} / ${H}))`, aspectRatio: `${W} / ${H}` }}
      >
        <img
          src={reference}
          alt="Bloome, Nutre tu cuerpo, florece tu vida. Cuida tu salud, vive mejor. Bienvenido/a: inicia sesión para acceder a tu cuenta."
          className="absolute inset-0 h-full w-full select-none"
          draggable="false"
        />

        <form onSubmit={onSubmit} noValidate>
          <h1 className="sr-only">Bienvenido/a</h1>

          <Field area={[447, 242, 701, 276]} icon={Mail} iconArea={[458, 254, 472, 265]} error={errors.email}>
            <label htmlFor="email" className="sr-only">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Correo electrónico"
              maxLength={254}
              value={form.email}
              onChange={onChange}
              aria-invalid={Boolean(errors.email)}
              className={inputClass}
              style={{ paddingLeft: px(40), paddingRight: px(12), fontSize: px(10) }}
            />
          </Field>

          <Field area={[447, 283, 701, 316]} icon={Lock} iconArea={[459, 293, 471, 306]} error={errors.password}>
            <label htmlFor="password" className="sr-only">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Contraseña"
              maxLength={128}
              value={form.password}
              onChange={onChange}
              aria-invalid={Boolean(errors.password)}
              className={inputClass}
              style={{ paddingLeft: px(40), paddingRight: px(36), fontSize: px(10) }}
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute flex items-center justify-center text-[#A4C3B4] hover:text-[#EAF6F0]"
              style={{ left: px(222), top: 0, width: px(28), height: '100%' }}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <Eye style={{ width: px(15), height: px(15) }} aria-hidden="true" />
              ) : (
                <EyeOff style={{ width: px(15), height: px(15) }} aria-hidden="true" />
              )}
            </button>
          </Field>

          {/* Casilla "Recordarme": el texto es parte de la imagen; la casilla real va encima. */}
          <label className="absolute cursor-pointer" style={box(449, 322, 520, 342)}>
            <span className="sr-only">Recordarme</span>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => onRememberChange(e.target.checked)}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute hidden items-center justify-center bg-[#8FD3B0] text-[#0B3D2E] peer-checked:flex peer-focus-visible:outline-2 peer-focus-visible:outline-[#8FD3B0]"
              style={{ left: px(2), top: px(4), width: px(13), height: px(13), borderRadius: px(3) }}
            >
              <svg viewBox="0 0 16 16" style={{ width: px(10), height: px(10) }}>
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" />
              </svg>
            </span>
          </label>

          <button
            type="button"
            onClick={onForgot}
            className="absolute rounded-sm focus-visible:outline-2 focus-visible:outline-[#8FD3B0]"
            style={box(595, 323, 702, 342)}
          >
            <span className="sr-only">¿Olvidaste tu contraseña?</span>
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="absolute overflow-hidden transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8FD3B0] disabled:cursor-wait"
            style={{ ...box(447, 352, 701, 388), borderRadius: px(11) }}
          >
            {submitting ? (
              <span
                className="absolute inset-0 flex items-center justify-center font-semibold text-[#0B3D2E]"
                style={{ background: 'linear-gradient(180deg, #A8E8C6 0%, #5AA881 100%)', fontSize: px(12) }}
              >
                Verificando...
              </span>
            ) : (
              <span className="sr-only">Iniciar sesión</span>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={onRegister}
          className="absolute rounded-sm focus-visible:outline-2 focus-visible:outline-[#8FD3B0]"
          style={box(597, 424, 656, 441)}
        >
          <span className="sr-only">Regístrate</span>
        </button>
      </div>

      {/* Avisos fijos a la ventana (no al escenario) para que el recorte nunca los oculte. */}
      {message.text && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`absolute top-4 left-1/2 z-20 w-max max-w-[90vw] -translate-x-1/2 rounded-full border px-5 py-2.5 text-center text-sm backdrop-blur-md lg:max-w-[640px] ${
            message.tone === 'error'
              ? 'border-[#F19A9A]/40 bg-[#3A1A1A]/80 text-[#F7C2C2]'
              : 'border-[#8FD3B0]/40 bg-[#0B3D2E]/85 text-[#CDEBDD]'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
