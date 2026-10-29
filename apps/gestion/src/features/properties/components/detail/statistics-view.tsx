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
import {
  ChartColumnIcon,
  GlobeIcon,
  InboxIcon,
  MailIcon,
  MessageCircleIcon,
  PieChartIcon,
  SendIcon,
  UsersIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import { formatDate } from '../../../../lib/format';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../../shared/components/server-data-table';
import { BarList, DonutChart } from '../../../home/components/portfolio-charts';
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

  const sends = totals.emailSends + totals.whatsappSends;

  return (
    <ListNavigationProvider>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Cómo se movió la propiedad en los últimos {months} meses.
          </p>
          <MonthsSelect months={months} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            icon={MailIcon}
            label="Email"
            value={totals.emailSends}
            foot="Envíos a contactos"
          />
          <KpiCard
            icon={MessageCircleIcon}
            label="WhatsApp"
            value={totals.whatsappSends}
            foot="Envíos a contactos"
          />
          <KpiCard
            icon={UsersIcon}
            label="Interesados"
            value={totals.interested}
            foot="Búsquedas que coinciden"
          />
          <KpiCard
            icon={InboxIcon}
            label="Consultas"
            value={totals.inquiries}
            foot="En el período"
          />
          <KpiCard
            icon={GlobeIcon}
            label="Portales"
            value={totals.activePublications}
            foot="Publicaciones activas"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Actividad por mes"
            icon={ChartColumnIcon}
            subtitle={`Últimos ${String(months)} meses`}
            height={280}
            className="lg:col-span-2"
          >
            {hasActivity ? (
              <Chart type="bar" height={280} options={options} series={series} />
            ) : (
              <ChartEmpty height={280}>Sin envíos ni consultas en el período.</ChartEmpty>
            )}
          </ChartCard>
          <SectionCard title="Envíos por canal" icon={PieChartIcon}>
            <DonutChart
              totalLabel="Envíos"
              empty="Todavía no se envió a contactos."
              slices={[
                { key: 'email', label: 'Email', count: totals.emailSends },
                { key: 'whatsapp', label: 'WhatsApp', count: totals.whatsappSends },
              ]}
            />
            {sends > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <SendIcon className="size-3.5" aria-hidden />
                {sends.toLocaleString('es-AR')} envíos en total
              </p>
            )}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard
            title="Perfil de los interesados"
            icon={UsersIcon}
            bodyClassName="flex flex-1 flex-col"
          >
            <BarList
              empty="Sin interesados con etiquetas todavía."
              bars={statistics.interestedProfile.map((tag) => ({
                key: tag.tagId,
                label: tag.name,
                count: tag.clients,
              }))}
            />
          </SectionCard>
          <SectionCard title="Publicaciones en portales" icon={GlobeIcon}>
            {statistics.publications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No está publicada en portales.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {statistics.publications.map((publication) => {
                  const status = PORTAL_STATUS_DISPLAY[publication.status];
                  return (
                    <li
                      key={publication.portal}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold capitalize">{publication.portal}</span>
                        <span className="flex items-center gap-2">
                          {publication.publishedAt !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              Desde {formatDate(publication.publishedAt)}
                            </span>
                          )}
                          {status !== undefined && (
                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                          )}
                        </span>
                      </div>
                      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-2">
                        {(
                          [
                            ['Visitas', publication.views],
                            ['Contactos', publication.contacts],
                            ['Favoritos', publication.favorites],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="flex flex-col gap-0.5">
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="font-display text-lg leading-tight font-semibold tabular-nums">
                              {value.toLocaleString('es-AR')}
                            </dd>
                          </div>
                        ))}
                      </dl>
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
