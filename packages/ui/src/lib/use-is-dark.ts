import { useTheme } from 'next-themes';

/** Tema oscuro activo (para librerías que no leen clases, como ApexCharts). */
export function useIsDark(): boolean {
  return useTheme().resolvedTheme === 'dark';
}
