'use client';

import type { ApexOptions } from 'apexcharts';
import { lazy, Suspense, useMemo } from 'react';

import { CHART_COLORS } from '../lib/chart-colors';
import { useIsClient } from '../lib/use-is-client';
import { Skeleton } from './skeleton';

export type { ApexOptions } from 'apexcharts';

// ApexCharts necesita `window`: se carga solo en el cliente y en un chunk aparte.
const ReactApexChart = lazy(() => import('react-apexcharts'));

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'donut' | 'radialBar';

export interface ChartProps {
  readonly type: ChartType;
  readonly series: ApexOptions['series'];
  /** Memorizar con `useMemo` (dependiendo de `isDark`); partir de `baseChartOptions`. */
  readonly options: ApexOptions;
  /** Alto en px. Típicos: 220, 260, 280. */
  readonly height: number;
  readonly width?: number | string;
}

export function Chart({ type, series, options, height, width = '100%' }: ChartProps) {
  const isClient = useIsClient();
  const placeholder = <Skeleton className="w-full" style={{ height }} />;
  if (!isClient) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <ReactApexChart type={type} series={series} options={options} height={height} width={width} />
    </Suspense>
  );
}

/** Sparkline de área (KpiCard): 28 px, sin tooltip, ejes, grilla ni animación. */
export function Sparkline({
  data,
  color = CHART_COLORS.income,
}: {
  readonly data: readonly number[];
  readonly color?: string;
}) {
  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        sparkline: { enabled: true },
        animations: { enabled: false },
        background: 'transparent',
      },
      colors: [color],
      stroke: { width: 2, curve: 'smooth' },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
      tooltip: { enabled: false },
    }),
    [color],
  );
  const series = useMemo(() => [{ name: 'serie', data: [...data] }], [data]);

  return <Chart type="area" series={series} options={options} height={28} />;
}

/** Estado vacío de un gráfico, con el mismo alto que tendría el gráfico. */
export function ChartEmpty({
  height = 220,
  children = 'Sin datos',
}: {
  readonly height?: number;
  readonly children?: string;
}) {
  return (
    <p
      className="flex items-center justify-center text-sm leading-normal text-muted-foreground"
      style={{ height }}
    >
      {children}
    </p>
  );
}
