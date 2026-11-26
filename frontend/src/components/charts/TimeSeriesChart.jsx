import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../../models/analysis.model.js';
import { ChartTooltip, Legend } from './ChartParts.jsx';
import { axisProps, useChartTheme } from './useChartTheme.js';

// Serie temporal de una o varias lineas sobre un mismo eje (nunca doble eje).
// series = [{ key, label, points: [{ date, value }], color? }]
// reference = { value, label } opcional (p. ej. peso objetivo, linea discontinua).
export default function TimeSeriesChart({ series, unit, decimals = 1, reference, height = 240 }) {
  const t = useChartTheme();

  // Une todas las series en filas por fecha; un hueco queda como hueco (no se interpola).
  const rows = new Map();
  series.forEach((s) =>
    s.points.forEach((p) => {
      const ts = new Date(p.date).getTime();
      rows.set(ts, { ...(rows.get(ts) ?? { ts }), [s.key]: p.value });
    }),
  );
  const data = [...rows.values()].sort((a, b) => a.ts - b.ts);
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? t.accent : t.series[i]));
  const values = data.flatMap((r) => series.map((s) => r[s.key])).filter(Number.isFinite);
  if (reference && Number.isFinite(reference.value)) values.push(reference.value);
  const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  const domain = values.length ? [Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)] : ['auto', 'auto'];
  const format = (v) => `${fmt.number(v, decimals)} ${unit}`;

  return (
    <>
      <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={t.line} vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => fmt.shortDate(v)}
              {...axisProps(t)}
              minTickGap={24}
            />
            <YAxis domain={domain} tickFormatter={(v) => fmt.number(v, decimals)} width={56} {...axisProps(t)} />
            <Tooltip
              content={<ChartTooltip labelFormatter={(v) => fmt.date(v)} valueFormatter={format} />}
              cursor={{ stroke: t.muted, strokeDasharray: '3 3' }}
            />
            {reference && Number.isFinite(reference.value) && (
              <ReferenceLine
                y={reference.value}
                stroke={t.ink}
                strokeDasharray="6 4"
                strokeOpacity={0.7}
                label={{ value: reference.label, position: 'insideTopRight', fill: t.muted, fontSize: 12 }}
              />
            )}
            {series.map((s, i) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={colors[i]}
                strokeWidth={2}
                dot={{ r: 4, fill: colors[i], stroke: t.canvas, strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: t.canvas, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {(series.length > 1 || reference) && (
        <Legend
          items={[
            ...series.map((s, i) => ({ label: s.label, color: colors[i] })),
            ...(reference && Number.isFinite(reference.value) ? [{ label: reference.label, color: t.ink, dashed: true }] : []),
          ]}
        />
      )}
    </>
  );
}
