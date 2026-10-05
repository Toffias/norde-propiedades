'use client';

import type { PropertyStatistics } from '@norde/core/reporting/contracts';
import { Chart, ChartEmpty, type ApexOptions } from '@norde/ui/components/chart';
import { ChartCard } from '@norde/ui/components/chart-card';
import { KpiCard } from '@norde/ui/components/kpi-card';
import { SectionCard } from '@norde/ui/components/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { StatusPill } from '@norde/ui/components/status-pill';
import { CATEGORICAL_COLORS } from '@norde/ui/lib/chart-colors';
import { baseChartOptions } from '@norde/ui/lib/chart-options';
import { useIsDark } from '@norde/ui/lib/use-is-dark';
import { ChartColumnIcon, GlobeIcon, UsersIcon } from 'lucide-react';
import { useMemo } from 'react';

import { formatDate } from '../../../../lib/format';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../../shared/components/server-data-table';
import { PORTAL_STATUS_DISPLAY } from '../../detail-labels';

const MONTH_OPTIONS = [3, 6, 12, 24] as const;

/** "2026-09" → "sep. 26". */
function monthLabel(month: string): string {
  const [year = '', value = '1'] = month.split('-');
  const date = new Date(Date.UTC(Number(year), Number(value) - 1, 15));
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function MonthsSelect({ months }: { readonly months: number }) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={String(months)}
      onValueChange={(value) => {
        setParams({ meses: value });
      }}
    >
      <SelectTrigger size="sm" className="w-44" aria-label="Período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MONTH_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            Últimos {option} meses
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * La pestaña Estadísticas: envíos por email y WhatsApp, interesados, consultas y publicaciones;
 * el gráfico mensual y el perfil de los interesados por etiqueta.
 */
export function StatisticsView({
  statistics,
  months,
}: {
  readonly statistics: PropertyStatistics;
  readonly months: number;
}) {
  const isDark = useIsDark();
  const { totals, monthly } = statistics;
  const hasActivity = monthly.some((row) => row.emailSends + row.whatsappSends + row.inquiries > 0);

  const options = useMemo<ApexOptions>(
    () => ({
      ...baseChartOptions(isDark),
      colors: [...CATEGORICAL_COLORS],
      chart: { ...baseChartOptions(isDark).chart, stacked: false },
      plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
      legend: { position: 'top', horizontalAlign: 'left' },
      xaxis: { categories: monthly.map((row) => monthLabel(row.month)) },
      yaxis: { tickAmount: 4, labels: { formatter: (value) => String(Math.round(value)) } },
    }),
    [isDark, monthly],
  );
  const series = [
    { name: 'Envíos por email', data: monthly.map((row) => row.emailSends) },
    { name: 'Envíos por WhatsApp', data: monthly.map((row) => row.whatsappSends) },
    { name: 'Consultas', data: monthly.map((row) => row.inquiries) },
  ];

  return (
    <ListNavigationProvider>
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <MonthsSelect months={months} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Envíos por email" value={totals.emailSends} />
          <KpiCard label="Envíos por WhatsApp" value={totals.whatsappSends} />
          <KpiCard label="Interesados" value={totals.interested} foot="Búsquedas que coinciden" />
          <KpiCard label="Consultas" value={totals.inquiries} />
          <KpiCard label="Publicaciones activas" value={totals.activePublications} />
        </div>

        <ChartCard
          title="Actividad por mes"
          icon={ChartColumnIcon}
          subtitle={`Últimos ${String(months)} meses`}
          height={280}
        >
          {hasActivity ? (
            <Chart type="bar" height={280} options={options} series={series} />
          ) : (
            <ChartEmpty height={280}>Sin envíos ni consultas en el período.</ChartEmpty>
          )}
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Perfil de los interesados" icon={UsersIcon}>
            {statistics.interestedProfile.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin interesados con etiquetas todavía.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {statistics.interestedProfile.map((tag) => {
                  const max = statistics.interestedProfile[0]?.clients ?? 1;
                  return (
                    <li key={tag.tagId} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate">{tag.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${String(Math.round((tag.clients / max) * 100))}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums">{tag.clients}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Publicaciones en portales" icon={GlobeIcon}>
            {statistics.publications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No está publicada en portales.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {statistics.publications.map((publication) => {
                  const status = PORTAL_STATUS_DISPLAY[publication.status];
                  return (
                    <li key={publication.portal} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="w-28 font-medium capitalize">{publication.portal}</span>
                      {status !== undefined && (
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {publication.views} visitas · {publication.contacts} contactos ·{' '}
                        {publication.favorites} favoritos
                        {publication.publishedAt === undefined
                          ? ''
                          : ` · desde ${formatDate(publication.publishedAt)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </ListNavigationProvider>
  );
}
