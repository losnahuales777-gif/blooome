import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../../models/analysis.model.js';
import { ChartTooltip, Legend } from './ChartParts.jsx';
import { axisProps, useChartTheme } from './useChartTheme.js';

// Barras por dia (consumo, agua, actividad, adherencia) con meta opcional como linea discontinua.
export function DailyBarChart({ data, dataKey, label, unit, decimals = 0, target, targetLabel, max, height = 220 }) {
  const t = useChartTheme();
  const rows = data.filter((d) => Number.isFinite(d[dataKey]));
  const format = (v) => `${fmt.number(v, decimals)} ${unit}`;
  return (
    <>
      <div style={{ height }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap="20%">
            <CartesianGrid stroke={t.line} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => fmt.shortDate(`${d}T12:00:00`)} {...axisProps(t)} minTickGap={16} />
            <YAxis tickFormatter={(v) => fmt.number(v, 0)} width={56} domain={[0, max ?? 'auto']} {...axisProps(t)} />
            <Tooltip
              content={<ChartTooltip labelFormatter={(d) => fmt.date(`${d}T12:00:00`)} valueFormatter={format} />}
              cursor={{ fill: t.line }}
            />
            {Number.isFinite(target) && (
              <ReferenceLine y={target} stroke={t.ink} strokeDasharray="6 4" strokeOpacity={0.7} />
            )}
            <Bar dataKey={dataKey} name={label} fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {Number.isFinite(target) && (
        <Legend
          items={[
            { label, color: t.accent },
            { label: `${targetLabel ?? 'Meta'}: ${format(target)}`, color: t.ink, dashed: true },
          ]}
        />
      )}
    </>
  );
}

// Comparacion de categorias con una serie (p. ej. peso inicial, actual y objetivo).
export function CategoryBars({ data, unit, decimals = 1, height = 200 }) {
  const t = useChartTheme();
  const format = (v) => `${fmt.number(v, decimals)} ${unit}`;
  const values = data.map((d) => d.value).filter(Number.isFinite);
  const min = values.length ? Math.floor(Math.min(...values) * 0.9) : 0;
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 8 }}>
          <XAxis type="number" domain={[min, 'auto']} hide />
          <YAxis type="category" dataKey="label" width={88} {...axisProps(t)} />
          <Tooltip content={<ChartTooltip valueFormatter={format} />} cursor={{ fill: t.line }} />
          <Bar
            dataKey="value"
            name={unit}
            radius={[0, 4, 4, 0]}
            maxBarSize={26}
            isAnimationActive={false}
            label={{ position: 'right', fill: t.ink, fontSize: 13, formatter: (v) => fmt.number(v, decimals) }}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.kind === 'prescrito' ? t.muted : t.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Varias series agrupadas por categoria (p. ej. macronutrientes: registrado vs prescrito).
export function GroupedBars({ data, series, unit, decimals = 0, height = 220 }) {
  const t = useChartTheme();
  const format = (v) => `${fmt.number(v, decimals)} ${unit}`;
  return (
    <>
      <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(' contra ')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid stroke={t.line} vertical={false} />
            <XAxis dataKey="label" {...axisProps(t)} />
            <YAxis tickFormatter={(v) => fmt.number(v, 0)} width={56} {...axisProps(t)} />
            <Tooltip content={<ChartTooltip valueFormatter={format} />} cursor={{ fill: t.line }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? t.series[i]} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: s.color ?? t.series[i] }))} />
    </>
  );
}
