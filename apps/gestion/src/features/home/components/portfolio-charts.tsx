'use client';

import { Chart, type ApexOptions } from '@norde/ui/components/chart';
import {
  CATEGORICAL_COLORS,
  CHART_COLORS,
  chartGridColor,
  chartTextColors,
} from '@norde/ui/lib/chart-colors';
import { baseChartOptions } from '@norde/ui/lib/chart-options';
import { useIsDark } from '@norde/ui/lib/use-is-dark';
import { cn } from '@norde/ui/lib/utils';
import { useMemo } from 'react';

const CHART_HEIGHT = 200;

const percent = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

export interface ChartSlice {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** Porcentaje sobre el total; si falta, se calcula. */
  readonly share?: number;
}

function Legend({
  slices,
  colors,
  total,
}: {
  readonly slices: readonly ChartSlice[];
  readonly colors: readonly string[];
  readonly total: number;
}) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
      {slices.map((slice, index) => (
        <li key={slice.key} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colors[index % colors.length] }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{slice.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{slice.count}</span> ·{' '}
            {percent.format(slice.share ?? (total === 0 ? 0 : (slice.count / total) * 100))} %
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dona con el total en el centro y la leyenda al costado (los números, a la derecha). */
export function DonutChart({
  slices,
  totalLabel,
  empty,
}: {
  readonly slices: readonly ChartSlice[];
  readonly totalLabel: string;
  readonly empty: string;
}) {
  const isDark = useIsDark();
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const options = useMemo<ApexOptions>(() => {
    const text = chartTextColors(isDark);
    return {
      ...baseChartOptions(isDark),
      labels: slices.map((slice) => slice.label),
      colors: [...CATEGORICAL_COLORS],
      legend: { show: false },
      stroke: { width: 2, colors: [text.surface] },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              value: { fontSize: '22px', fontWeight: 600, offsetY: 4, color: text.foreground },
              total: {
                show: true,
                label: totalLabel,
                fontSize: '12px',
                fontWeight: 500,
                color: text.muted,
              },
            },
          },
        },
      },
    };
  }, [isDark, slices, totalLabel]);
  const series = useMemo(() => slices.map((slice) => slice.count), [slices]);

  if (total === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="w-44 shrink-0">
        <Chart type="donut" series={series} options={options} height={CHART_HEIGHT} />
      </div>
      <Legend slices={slices} colors={CATEGORICAL_COLORS} total={total} />
    </div>
  );
}

/**
 * Anillo de avance: qué parte del total cumple algo ("29 de 35 disponibles"), con el desglose
 * debajo.
 */
export function ProgressRing({
  value,
  total,
  label,
  slices,
  empty,
}: {
  readonly value: number;
  readonly total: number;
  readonly label: string;
  readonly slices: readonly (ChartSlice & { readonly tone: string })[];
  readonly empty: string;
}) {
  const isDark = useIsDark();
  const share = total === 0 ? 0 : Math.round((value / total) * 100);
  const options = useMemo<ApexOptions>(() => {
    const text = chartTextColors(isDark);
    return {
      ...baseChartOptions(isDark),
      colors: [CHART_COLORS.positive],
      stroke: { lineCap: 'round' },
      plotOptions: {
        radialBar: {
          hollow: { size: '64%' },
          track: { background: chartGridColor(isDark) },
          dataLabels: {
            name: {
              show: true,
              offsetY: 22,
              fontSize: '12px',
              fontWeight: 500,
              color: text.muted,
            },
            value: {
              show: true,
              offsetY: -12,
              fontSize: '22px',
              fontWeight: 600,
              color: text.foreground,
              formatter: () => `${String(share)} %`,
            },
          },
        },
      },
      labels: [label],
    };
  }, [isDark, label, share]);
  const series = useMemo(() => [share], [share]);

  if (total === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="w-44 shrink-0">
        <Chart type="radialBar" series={series} options={options} height={CHART_HEIGHT} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch sm:justify-center">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{value}</span> de{' '}
          <span className="tabular-nums">{total}</span> {label}
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2">
              <span className={cn('size-2.5 shrink-0 rounded-full', slice.tone)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{slice.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
