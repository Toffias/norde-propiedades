import { CONTACT_CHANNEL_LABELS } from '@norde/core/clients/contracts';
import type {
  AvailableDevelopmentRow,
  AvailablePropertyRow,
  PortfolioSummary,
} from '@norde/core/reporting/contracts';
import type { Page } from '@norde/core/shared';
import { KpiCard } from '@norde/ui/components/kpi-card';
import { SectionCard } from '@norde/ui/components/section-card';
import { STATUS_DOT } from '@norde/ui/components/status-pill';
import { Building2Icon, HouseIcon, KanbanIcon, PieChartIcon, UsersIcon } from 'lucide-react';

import { PROPERTY_STATUS_DISPLAY } from '../../properties/labels';
import type { WidgetState } from '../home-state';

import { AvailableDevelopmentsList, AvailablePropertiesList } from './available-lists';
import { DonutChart, ProgressRing } from './portfolio-charts';

interface Bar {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** Texto a la derecha de la barra; por defecto, el número. */
  readonly value?: string;
  /** Color propio (el de un estado de oportunidad); por defecto, el primario. */
  readonly color?: string;
}

/** Barras horizontales proporcionales al mayor valor, con el número a la derecha. */
function BarList({ bars, empty }: { readonly bars: readonly Bar[]; readonly empty: string }) {
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  if (bars.every((bar) => bar.count === 0)) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {bars.map((bar) => (
        <li key={bar.key} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate sm:w-40">{bar.label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{
                width: `${String(Math.round((bar.count / max) * 100))}%`,
                ...(bar.color === undefined || bar.color === ''
                  ? {}
                  : { backgroundColor: bar.color }),
              }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
            {bar.value ?? String(bar.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function ErrorText({ message }: { readonly message: string }) {
  return (
    <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
      {message}
    </p>
  );
}

/**
 * La pestaña Estado actual: la cartera con el alcance de quien mira. Cada bloque aparece solo con
 * el permiso de su módulo; los listados de disponibles se paginan en el servidor.
 */
export function PortfolioView({
  summary,
  properties,
  developments,
}: {
  readonly summary: WidgetState<PortfolioSummary>;
  readonly properties: WidgetState<Page<AvailablePropertyRow>>;
  readonly developments: WidgetState<Page<AvailableDevelopmentRow>>;
}) {
  if (summary.kind === 'error') return <ErrorText message={summary.message} />;
  const value = summary.kind === 'ok' ? summary.value : undefined;
  const byStatus = value?.propertiesByStatus;
  const available = byStatus?.find((row) => row.status === 'available')?.count ?? 0;
  const drafts = byStatus?.find((row) => row.status === 'draft')?.count ?? 0;
  const portfolio = byStatus?.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const openOpportunities = value?.openOpportunitiesByStage?.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {value?.clientsWithOpenOpportunity !== undefined && (
          <KpiCard
            icon={UsersIcon}
            label="Clientes con oportunidad abierta"
            value={value.clientsWithOpenOpportunity}
            {...(openOpportunities === undefined
              ? {}
              : {
                  foot: plural(openOpportunities, 'oportunidad abierta', 'oportunidades abiertas'),
                })}
          />
        )}
        {byStatus !== undefined && (
          <KpiCard
            icon={HouseIcon}
            label="Propiedades disponibles"
            value={available}
            foot={`de ${String(portfolio)} en cartera${drafts > 0 ? ` · ${String(drafts)} en borrador` : ''}`}
          />
        )}
        {value?.availableDevelopments !== undefined && (
          <KpiCard
            icon={Building2Icon}
            label="Emprendimientos disponibles"
            value={value.availableDevelopments}
            foot="En comercialización"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {value?.openOpportunitiesByChannel !== undefined && (
          <SectionCard title="Oportunidades abiertas por canal de origen" icon={PieChartIcon}>
            <DonutChart
              totalLabel="Abiertas"
              empty="No hay oportunidades abiertas."
              slices={value.openOpportunitiesByChannel.map((row) => ({
                key: row.channel ?? 'none',
                label:
                  row.channel === undefined
                    ? 'Sin canal'
                    : (CONTACT_CHANNEL_LABELS[row.channel] ?? row.channel),
                count: row.count,
                share: row.share,
              }))}
            />
          </SectionCard>
        )}
        {value?.openOpportunitiesByStage !== undefined && (
          <SectionCard title="Oportunidades abiertas por estado" icon={KanbanIcon}>
            <BarList
              empty="No hay oportunidades abiertas."
              bars={value.openOpportunitiesByStage.map((row) => ({
                key: row.stageId,
                label: row.name,
                count: row.count,
                color: row.color,
              }))}
            />
          </SectionCard>
        )}
        {byStatus !== undefined && (
          <SectionCard title="Propiedades por estado" icon={HouseIcon}>
            <ProgressRing
              value={available}
              total={portfolio}
              label="disponibles"
              empty="No hay propiedades cargadas."
              slices={byStatus.map((row) => ({
                key: row.status,
                label: PROPERTY_STATUS_DISPLAY[row.status].label,
                count: row.count,
                tone: STATUS_DOT[PROPERTY_STATUS_DISPLAY[row.status].tone],
              }))}
            />
          </SectionCard>
        )}
      </div>

      {properties.kind === 'error' && <ErrorText message={properties.message} />}
      {properties.kind === 'ok' && <AvailablePropertiesList page={properties.value} />}
      {developments.kind === 'error' && <ErrorText message={developments.message} />}
      {developments.kind === 'ok' && <AvailableDevelopmentsList page={developments.value} />}
    </div>
  );
}
