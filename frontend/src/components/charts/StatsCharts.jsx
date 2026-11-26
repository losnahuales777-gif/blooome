import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { fmt } from '../../models/analysis.model.js';
import { ChartTooltip, Legend } from './ChartParts.jsx';
import { axisProps, useChartTheme } from './useChartTheme.js';

// Dona para partes de un todo (2-4 categorias). Total al centro; identidad con leyenda + valores.
export function Donut({ data, height = 200 }) {
  const t = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = data.map((d, i) => d.color ?? t.series[i]);
  return (
    <>
      <div className="relative" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke={t.canvas} strokeWidth={2} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={colors[i]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} (${total ? Math.round((v / total) * 100) : 0}%)`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-muted">total</span>
        </div>
      </div>
      <Legend items={data.map((d, i) => ({ label: `${d.label}: ${d.value}`, color: colors[i] }))} />
    </>
  );
}

// Barras por mes; con stack=true las series se apilan (p. ej. consultas por estado).
export function MonthlyBars({ data, series, unit = '', stack = false, height = 230 }) {
  const t = useChartTheme();
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? t.accent : t.series[i]));
  return (
    <>
      <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={t.line} vertical={false} />
            <XAxis dataKey="month" tickFormatter={fmt.month} {...axisProps(t)} minTickGap={8} />
            <YAxis allowDecimals={false} width={48} {...axisProps(t)} />
            <Tooltip content={<ChartTooltip labelFormatter={fmt.month} valueFormatter={(v) => `${v}${unit}`} />} cursor={{ fill: t.line }} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId={stack ? 'a' : undefined}
                fill={colors[i]}
                stroke={stack ? t.canvas : undefined}
                strokeWidth={stack ? 1 : 0}
                radius={stack && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />}
    </>
  );
}

// Linea por mes de un solo indicador (los indicadores de distinta escala van en graficas separadas).
export function MonthlyLine({ data, dataKey, label, unit, decimals = 1, domain, height = 200 }) {
  const t = useChartTheme();
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={t.line} vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmt.month} {...axisProps(t)} minTickGap={8} />
          <YAxis domain={domain ?? ['auto', 'auto']} tickFormatter={(v) => fmt.number(v, decimals)} width={52} {...axisProps(t)} />
          <Tooltip
            content={<ChartTooltip labelFormatter={fmt.month} valueFormatter={(v) => `${fmt.number(v, decimals)} ${unit}`} />}
            cursor={{ stroke: t.muted, strokeDasharray: '3 3' }}
          />
          <Line dataKey={dataKey} name={label} stroke={t.accent} strokeWidth={2} dot={{ r: 4, fill: t.accent, stroke: t.canvas, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Histograma: clases contiguas de igual ancho (sin espacio entre barras).
export function Histogram({ bins, unit, height = 220 }) {
  const t = useChartTheme();
  const data = bins.map((b) => ({ ...b, label: `${fmt.number(b.from)}–${fmt.number(b.to)}` }));
  return (
    <div style={{ height }} role="img" aria-label={`Distribucion de ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={1}>
          <CartesianGrid stroke={t.line} vertical={false} />
          <XAxis dataKey="label" {...axisProps(t)} interval={0} angle={-30} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} width={48} {...axisProps(t)} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => `${l} ${unit}`} valueFormatter={(v) => `${v} pacientes`} />} cursor={{ fill: t.line }} />
          <Bar dataKey="count" name="Pacientes" fill={t.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Dispersion edad-IMC: un punto por paciente activo (sin datos identificativos).
export function AgeBmiScatter({ points, height = 240 }) {
  const t = useChartTheme();
  return (
    <div style={{ height }} role="img" aria-label="Edad contra indice de masa corporal">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid stroke={t.line} />
          <XAxis type="number" dataKey="age" name="Edad" unit=" a" domain={[18, 60]} {...axisProps(t)} />
          <YAxis type="number" dataKey="bmi" name="IMC" domain={['auto', 'auto']} width={48} {...axisProps(t)} />
          <ZAxis range={[64, 64]} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-sm text-ink">
                  {payload[0].payload.age} anos, IMC {fmt.number(payload[0].payload.bmi)}
                </div>
              ) : null
            }
          />
          <Scatter data={points} fill={t.accent} fillOpacity={0.75} stroke={t.canvas} strokeWidth={1.5} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

// Mapa de calor dia x hora de consultas. Escala secuencial de un solo tono (acento) y el numero
// visible en cada celda, para que no dependa solo del color.
export function Heatmap({ cells }) {
  const hours = cells.length ? [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b) : [];
  const from = Math.min(...hours, 8);
  const to = Math.max(...hours, 19);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const max = Math.max(1, ...cells.map((c) => c.count));
  const get = (d, h) => cells.find((c) => c.day === d && c.hour === h)?.count ?? 0;

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs" aria-label="Consultas por dia de la semana y hora">
        <thead>
          <tr>
            <th className="sr-only">Dia</th>
            {range.map((h) => (
              <th key={h} scope="col" className="px-1 font-normal text-muted">
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((label, i) => (
            <tr key={label}>
              <th scope="row" className="pr-2 text-left font-normal text-muted">
                {label}
              </th>
              {range.map((h) => {
                const n = get(i + 1, h);
                return (
                  <td
                    key={h}
                    title={`${label} ${h}:00, ${n} consultas`}
                    className="size-8 min-w-8 rounded-md text-center tabular-nums"
                    style={{
                      background: n ? `color-mix(in srgb, var(--c-accent) ${20 + (n / max) * 80}%, transparent)` : 'var(--c-tint)',
                      color: n / max > 0.55 ? 'var(--c-on-accent)' : 'var(--c-ink)',
                    }}
                  >
                    {n || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
