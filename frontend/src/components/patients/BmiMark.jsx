// Marca de categoria de IMC: color + forma, para que se distinga sin depender del color.
export function MarkShape({ shape, x = 0, y = 0, size = 10, color, ring = 'var(--c-canvas)' }) {
  const r = size / 2;
  // style (no atributos) para admitir variables CSS del tema.
  const common = { style: { fill: color, stroke: ring }, strokeWidth: 2 };
  switch (shape) {
    case 'square':
      return <rect x={x - r} y={y - r} width={size} height={size} rx={1.5} {...common} />;
    case 'triangle':
      return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...common} />;
    case 'diamond':
      return <polygon points={`${x},${y - r - 1.5} ${x + r + 1.5},${y} ${x},${y + r + 1.5} ${x - r - 1.5},${y}`} {...common} />;
    default:
      return <circle cx={x} cy={y} r={r} {...common} />;
  }
}

export default function BmiBadge({ category, value }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <svg viewBox="-8 -8 16 16" className="size-3.5" aria-hidden="true">
        <MarkShape shape={category.shape} color={category.color} size={9} ring="transparent" />
      </svg>
      {value !== undefined && <span className="font-bold tabular-nums">{value.toFixed(1)}</span>}
      <span className="text-muted">{category.label}</span>
    </span>
  );
}
