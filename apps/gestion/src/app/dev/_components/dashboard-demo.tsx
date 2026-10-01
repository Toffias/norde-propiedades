'use client';

import { Chart, type ApexOptions } from '@norde/ui/components/chart';
import { ChartCard } from '@norde/ui/components/chart-card';
import { KpiCard } from '@norde/ui/components/kpi-card';
import { PageHeader } from '@norde/ui/components/page-header';
import { CATEGORICAL_COLORS, CHART_COLORS } from '@norde/ui/lib/chart-colors';
import { baseChartOptions } from '@norde/ui/lib/chart-options';
import { useIsDark } from '@norde/ui/lib/use-is-dark';
import { LayoutDashboardIcon } from 'lucide-react';
import { useMemo } from 'react';

import { formatMoneyCompact, formatPeriod } from '../../../lib/format';

const MONTHS = [4, 5, 6, 7, 8, 9].map((month) => formatPeriod(2026, month, 'short'));
// Unidades enteras (pesos), solo para mostrar.
const INCOME = [3_800_000, 4_100_000, 3_950_000, 4_600_000, 5_200_000, 5_450_000];
const EXPENSES = [1_200_000, 1_350_000, 1_300_000, 1_500_000, 1_420_000, 1_610_000];
const OPERATIONS = { labels: ['Venta', 'Alquiler', 'Temporario'], values: [42, 31, 9] };
const CHANNELS = {
  labels: ['WhatsApp', 'Zonaprop', 'Argenprop', 'Web', 'Oficina'],
  values: [128, 74, 41, 33, 12],
};

export function DashboardDemo() {
  const isDark = useIsDark();

  const barOptions = useMemo<ApexOptions>(() => {
    const base = baseChartOptions(isDark, (value) => formatMoneyCompact(value));
    return {
      ...base,
      colors: [CHART_COLORS.income, CHART_COLORS.expenses],
      plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } },
      legend: { position: 'top', horizontalAlign: 'left' },
      xaxis: { categories: MONTHS },
      yaxis: { tickAmount: 4, labels: { formatter: (value) => formatMoneyCompact(value) } },
    };
  }, [isDark]);

  const donutOptions = useMemo<ApexOptions>(() => {
    const total = OPERATIONS.values.reduce((sum, value) => sum + value, 0);
    return {
      ...baseChartOptions(isDark, (value) => `${String(value)} propiedades`),
      labels: OPERATIONS.labels,
      colors: [...CATEGORICAL_COLORS],
      stroke: { width: 0 },
      legend: { position: 'bottom' },
      plotOptions: {
        pie: {
          donut: {
            size: '64%',
            labels: {
              show: true,
              total: { show: true, label: 'Total', formatter: () => String(total) },
            },
          },
        },
      },
    };
  }, [isDark]);

  const channelOptions = useMemo<ApexOptions>(
    () => ({
      ...baseChartOptions(isDark, (value) => `${String(value)} consultas`),
      colors: [CHART_COLORS.info],
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '70%' } },
      xaxis: { categories: CHANNELS.labels, tickAmount: 4 },
    }),
    [isDark],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={LayoutDashboardIcon} title="Tablero" subtitle="Septiembre 2026" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ingresos del mes"
          value={formatMoneyCompact(5_450_000)}
          foot="+4,8 % vs. agosto"
          tone="positive"
          sparkline={INCOME}
        />
        <KpiCard
          label="Gastos del mes"
          value={formatMoneyCompact(1_610_000)}
          foot="+13 % vs. agosto"
          tone="negative"
          sparkline={EXPENSES}
        />
        <KpiCard label="Propiedades publicadas" value="82" foot="6 sin fotos" tone="warning" />
        <KpiCard label="Consultas sin atender" value="3" foot="La más vieja, hace 2 h" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ingresos y gastos" subtitle="Últimos 6 meses" height={260}>
          <Chart
            type="bar"
            height={260}
            options={barOptions}
            series={[
              { name: 'Ingresos', data: INCOME },
              { name: 'Gastos', data: EXPENSES },
            ]}
          />
        </ChartCard>
        <ChartCard title="Propiedades por operación" height={260}>
          <Chart type="donut" height={260} options={donutOptions} series={OPERATIONS.values} />
        </ChartCard>
      </div>

      <ChartCard title="Consultas por canal" subtitle="Septiembre 2026" height={220}>
        <Chart
          type="bar"
          height={220}
          options={channelOptions}
          series={[{ name: 'Consultas', data: CHANNELS.values }]}
        />
      </ChartCard>
    </div>
  );
}
