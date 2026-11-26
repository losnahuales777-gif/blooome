import { useState } from 'react';
import { AGE_RANGE, BMI_CATEGORIES } from '../../models/patient.model.js';
import { MarkShape } from './BmiMark.jsx';

const W = 1000;
const PAD_X = 28;
const LANE = 17;
const TOP = 64; // espacio para el tooltip sobre las marcas
const TICKS = [18, 25, 30, 35, 40, 45, 50, 55, 60];

const xFor = (age) => PAD_X + ((age - AGE_RANGE.min) / (AGE_RANGE.max - AGE_RANGE.min)) * (W - PAD_X * 2);

// Regla 18-60: cada paciente es una marca en su edad, apilada si comparte edad con otro.
export default function AgeRuler({ patients, onSelect }) {
  const [hover, setHover] = useState(null);

  // El alto crece con la pila mas alta: sin espacio vacio cuando nadie comparte edad.
  const lanes = new Map();
  const placed = [...patients.filter((p) => p.bmiCategory)]
    .sort((a, b) => a.age - b.age || a.bmi - b.bmi)
    .map((p) => {
      const lane = lanes.get(p.age) ?? 0;
      lanes.set(p.age, lane + 1);
      return { p, lane };
    });
  const maxLanes = Math.max(1, ...lanes.values());
  const BASELINE = TOP + maxLanes * LANE + 8;
  const height = BASELINE + 34;
  const marks = placed.map(({ p, lane }) => ({ p, x: xFor(p.age), y: BASELINE - 16 - lane * LANE }));

  return (
    <figure className="m-0">
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Categorias de IMC">
        {BMI_CATEGORIES.map((c) => (
          <li key={c.code} className="flex items-center gap-1.5">
            <svg viewBox="-8 -8 16 16" className="size-3.5" aria-hidden="true">
              <MarkShape shape={c.shape} color={c.color} size={9} ring="transparent" />
            </svg>
            {c.label}
            <span className="text-muted tabular-nums">{patients.filter((p) => p.bmiCategory.code === c.code).length}</span>
          </li>
        ))}
      </ul>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="block w-full min-w-[640px]"
          role="img"
          aria-label={`Distribucion de ${patients.length} pacientes por edad e IMC`}
        >
          <line x1={PAD_X} x2={W - PAD_X} y1={BASELINE} y2={BASELINE} className="stroke-muted" strokeWidth="1.5" />
          {TICKS.map((age) => (
            <g key={age}>
              <line x1={xFor(age)} x2={xFor(age)} y1={BASELINE} y2={BASELINE + 7} className="stroke-muted" strokeWidth="1.5" />
              <text x={xFor(age)} y={BASELINE + 24} textAnchor="middle" fontSize="13" className="fill-muted">
                {age}
              </text>
            </g>
          ))}
          {Array.from({ length: AGE_RANGE.max - AGE_RANGE.min + 1 }, (_, i) => AGE_RANGE.min + i)
            .filter((age) => !TICKS.includes(age))
            .map((age) => (
              <line key={age} x1={xFor(age)} x2={xFor(age)} y1={BASELINE} y2={BASELINE + 3} className="stroke-line" />
            ))}

          {marks.map(({ p, x, y }) => (
            <g
              key={p.id}
              tabIndex={0}
              role="button"
              aria-label={`${p.fullName}, ${p.age} anos, IMC ${p.bmi.toFixed(1)} ${p.bmiCategory.label}`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHover({ p, x, y })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ p, x, y })}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(p)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p))}
            >
              <circle cx={x} cy={y} r={11} fill="transparent" />
              <MarkShape shape={p.bmiCategory.shape} color={p.bmiCategory.color} x={x} y={y} size={hover?.p.id === p.id ? 14 : 11} />
            </g>
          ))}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-max -translate-x-1/2 -translate-y-full glass-strong rounded-xl px-3 py-2 text-sm text-ink"
            style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / height) * 100}%`, marginTop: -12 }}
          >
            <p className="font-bold">{hover.p.fullName}</p>
            <p className="text-muted">
              {hover.p.age} anos, IMC {hover.p.bmi.toFixed(1)} ({hover.p.bmiCategory.label})
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-1 text-xs text-muted">Edad en anos. Selecciona una marca para abrir la ficha.</figcaption>
    </figure>
  );
}
