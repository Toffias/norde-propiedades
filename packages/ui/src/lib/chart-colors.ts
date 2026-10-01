// ApexCharts no lee clases de Tailwind: los colores de los gráficos viven acá, espejo de la paleta
// de themes/gestion.css. El mismo concepto se pinta del mismo color en todos los tableros.

export const CHART_COLORS = {
  income: '#e5383b', // primary-500
  expenses: '#841c19', // primary-800
  positive: '#16a167', // success-500
  negative: '#c9553a', // danger-500
  info: '#3a72b8', // info-500
  muted: '#c7c2b4', // gray-400
} as const;

export const CATEGORICAL_COLORS = [
  '#e5383b', // primary-500
  '#3a72b8', // info-500
  '#c7a748', // warning-500
  '#16a167', // success-500
  '#841c19', // primary-800
  '#8badde', // info-300
  '#a08a3c', // warning-600
  '#c7c2b4', // gray-400
] as const;

/** Color de la grilla: gray-200 en claro, surface-dark-3 en oscuro. */
export function chartGridColor(isDark: boolean): string {
  return isDark ? '#26251f' : '#edeae0';
}
