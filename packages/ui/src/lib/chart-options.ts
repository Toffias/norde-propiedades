import type { ApexOptions } from 'apexcharts';

import { chartGridColor } from './chart-colors';

/**
 * Opciones comunes de todos los gráficos: sin toolbar ni animaciones, tipografía heredada y
 * grilla punteada del tema. `formatValue` formatea el valor del tooltip (ej. montos).
 * Memorizar el resultado con `useMemo` dependiendo de `isDark`.
 */
export function baseChartOptions(
  isDark: boolean,
  formatValue: (value: number) => string = String,
): ApexOptions {
  return {
    chart: {
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent',
      animations: { enabled: false },
    },
    theme: { mode: isDark ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    grid: { strokeDashArray: 4, borderColor: chartGridColor(isDark) },
    tooltip: { y: { formatter: formatValue } },
  };
}
