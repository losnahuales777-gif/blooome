import { useMemo } from 'react';
import { useTheme } from '../../business/theme/useTheme.js';

// Recharts dibuja SVG con atributos, que no resuelven variables CSS: se leen los colores del tema
// activo y se recalculan cuando cambia el tema.
const read = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(
    () => ({
      series: [read('--chart-1'), read('--chart-2'), read('--chart-3'), read('--chart-4')],
      accent: read('--c-accent'),
      ink: read('--c-ink'),
      muted: read('--c-muted'),
      line: read('--c-line'),
      canvas: read('--c-canvas'),
      danger: read('--c-danger'),
    }),
    [theme],
  );
}

// Ejes y rejilla discretos: la informacion esta en las marcas, no en el andamiaje.
export function axisProps(t) {
  return {
    stroke: t.line,
    tick: { fill: t.muted, fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: t.line },
  };
}
