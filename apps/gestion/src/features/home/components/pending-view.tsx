import { CONTACT_CHANNEL_LABELS } from '@norde/core/clients/contracts';
import type {
  HomeWidget,
  PendingOpportunityRow,
  UnassignedInquiryRow,
  UpcomingSigningRow,
} from '@norde/core/reporting/contracts';
import { SectionCard } from '@norde/ui/components/section-card';
import { StatusPill } from '@norde/ui/components/status-pill';
import { CalendarClockIcon, InboxIcon, PhoneCallIcon, type LucideIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatDateOnly } from '../../../lib/format';
import { formatAge } from '../../inquiries/inquiry-format';
import type { HomeFilterValues } from '../home-params';
import type { WidgetState } from '../home-state';

function withQuery(path: string, params: Readonly<Record<string, string>>): Route {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ''),
  ).toString();
  // typedRoutes no verifica un string armado: las rutas son las de cada módulo.
  return `${path}${query === '' ? '' : `?${query}`}` as Route;
}

function Widget<T>({
  title,
  icon,
  state,
  href,
  empty,
  children,
}: {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly state: WidgetState<HomeWidget<T>>;
  readonly href: Route;
  readonly empty: string;
  readonly children: (rows: readonly T[]) => ReactNode;
}) {
  if (state.kind === 'hidden') return null;
  const total = state.kind === 'ok' ? state.value.total : undefined;
  return (
    <SectionCard
      title={total === undefined ? title : `${title} (${String(total)})`}
      icon={icon}
      action={
        <Link
          href={href}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver todas
        </Link>
      }
    >
      {state.kind === 'error' ? (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
          {state.message}
        </p>
      ) : state.value.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="-my-2 flex flex-col divide-y divide-border">
          {children(state.value.items)}
        </ul>
      )}
    </SectionCard>
  );
}

function Row({
  title,
  detail,
  aside,
}: {
  readonly title: ReactNode;
  readonly detail: ReactNode;
  readonly aside: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">{aside}</div>
    </li>
  );
}

function inquirySubject(row: UnassignedInquiryRow): string {
  const channel = CONTACT_CHANNEL_LABELS[row.channel] ?? row.channel;
  const subject = row.propertyCode ?? row.developmentName;
  return subject === undefined ? channel : `${channel} · ${subject}`;
}

/**
 * La pestaña Pendientes: lo que hay que atender hoy. Cada widget trae sus primeras filas y el
 * total; "Ver todas" abre el módulo con los mismos filtros.
 */
export function PendingView({
  inquiries,
  opportunities,
  signings,
  filters,
  now,
}: {
  readonly inquiries: WidgetState<HomeWidget<UnassignedInquiryRow>>;
  readonly opportunities: WidgetState<HomeWidget<PendingOpportunityRow>>;
  readonly signings: WidgetState<HomeWidget<UpcomingSigningRow>>;
  readonly filters: HomeFilterValues;
  readonly now: Date;
}) {
  const visible = [inquiries, opportunities, signings].some((state) => state.kind !== 'hidden');
  if (!visible) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés pendientes para mostrar con tus permisos.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Widget
        title="Consultas sin asignar"
        icon={InboxIcon}
        state={inquiries}
        href={withQuery('/consultas', { branchId: filters.branchId })}
        empty="No hay consultas sin asignar."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              title={row.senderName ?? 'Sin nombre'}
              detail={inquirySubject(row)}
              aside={formatAge(row.receivedAt, now)}
            />
          ))
        }
      </Widget>

      <Widget
        title="Pendientes de contactar"
        icon={PhoneCallIcon}
        state={opportunities}
        href={withQuery('/oportunidades', { category: 'new', ...filters })}
        empty="No hay oportunidades pendientes de contactar."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              title={
                <Link
                  href={`/contactos/${row.clientId}` as Route}
                  className="underline-offset-4 hover:underline"
                >
                  {row.clientName ?? 'Sin nombre'}
                </Link>
              }
              detail={[
                row.originChannel === undefined
                  ? undefined
                  : (CONTACT_CHANNEL_LABELS[row.originChannel] ?? row.originChannel),
                row.agent?.name ?? (row.agent === undefined ? 'Sin agente' : undefined),
              ]
                .filter((part) => part !== undefined)
                .join(' · ')}
              aside={formatAge(row.waitingSince, now)}
            />
          ))
        }
      </Widget>

      <Widget
        title="Próximos vencimientos"
        icon={CalendarClockIcon}
        state={signings}
        href={withQuery('/reservas', {
          status: 'active',
          sort: 'estimatedSigningDate',
          ...filters,
        })}
        empty="No hay reservas por firmar en los próximos 30 días."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              title={
                <Link
                  href={`/propiedades/${row.propertyId}?tab=reservas` as Route}
                  className="underline-offset-4 hover:underline"
                >
                  {row.propertyCode} · {row.propertyTitle}
                </Link>
              }
              detail={`Reserva de ${row.clientName ?? 'cliente sin nombre'}`}
              aside={
                <span className="flex flex-col items-end gap-1">
                  <span>Firma {formatDateOnly(row.estimatedSigningDate)}</span>
                  {row.overdue && <StatusPill tone="red">Vencida</StatusPill>}
                </span>
              }
            />
          ))
        }
      </Widget>
    </div>
  );
}
