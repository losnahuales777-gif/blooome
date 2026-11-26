import mascot from '../../assets/brand/nutria-mascota.webp';

// Cabeza de la mascota recortada de la ilustracion completa, dentro de un circulo (sidebar).
export function MascotBadge({ className = 'size-14' }) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-full bg-[#A7D6C0] bg-no-repeat ring-2 ring-[#61B795]/40 ${className}`}
      style={{ backgroundImage: `url(${mascot})`, backgroundSize: '240%', backgroundPosition: '56% 6%' }}
    />
  );
}

// Hoja pequena rellena: punto de la "i" del logotipo y decoracion.
export function LeafShape({ className, gradientId = 'leaf-grad' }) {
  return (
    <svg viewBox="0 0 40 60" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7FCBA4" />
          <stop offset="1" stopColor="#2E9D74" />
        </linearGradient>
      </defs>
      <path d="M20 2 C36 14 38 40 20 58 C2 40 4 14 20 2 Z" fill={`url(#${gradientId})`} />
      <path d="M20 10 V52" stroke="#0B3D2E" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Logotipo del login (pantallas pequenas): mascota monocroma menta + "Bloome" en dos tonos y el eslogan.
export default function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span
        aria-hidden="true"
        className="block h-[68px] w-[72px] shrink-0 bg-no-repeat sm:h-[86px] sm:w-[92px]"
        style={{
          backgroundImage: `url(${mascot})`,
          backgroundSize: '210%',
          backgroundPosition: '58% 2%',
          filter: 'grayscale(1) contrast(1.35) brightness(1.25) sepia(1) hue-rotate(95deg) saturate(1.8)',
        }}
      />
      <div>
        <p className="text-[2.7rem] leading-none font-bold tracking-tight text-[#EAF6F0] sm:text-[3.4rem]">
          Bloo<span className="text-[#8FD3B0]">me</span>
        </p>
        <p className="mt-2 flex items-center gap-2 text-[0.8rem] whitespace-nowrap text-[#A7D6C0]">
          <span className="h-px w-5 bg-[#A7D6C0]/60" aria-hidden="true" />
          Nutre tu cuerpo, florece tu vida
          <span className="h-px w-5 bg-[#A7D6C0]/60" aria-hidden="true" />
        </p>
      </div>
    </div>
  );
}
