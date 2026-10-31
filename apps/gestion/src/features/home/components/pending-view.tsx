import { CONTACT_CHANNEL_LABELS } from '@norde/core/clients/contracts';
import type {
  HomeWidget,
  PendingOpportunityRow,
  PortalAlertRow,
  UnassignedInquiryRow,
  UpcomingSigningRow,
  UrgencyValue,
} from '@norde/core/reporting/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { StatusPill } from '@norde/ui/components/status-pill';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { initials } from '@norde/ui/lib/initials';
import { cn } from '@norde/ui/lib/utils';
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  InboxIcon,
  MegaphoneIcon,
  PhoneCallIcon,
  PhoneIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatDateOnly } from '../../../lib/format';
import { whatsappHref } from '../../clients/client-format';
import { formatAge } from '../../inquiries/inquiry-format';
import { PORTAL_LABELS } from '../../portals/messages';
import { PENDING_FOCUS_VALUES, type HomeFilterValues, type PendingFocus } from '../home-params';
import type { WidgetState } from '../home-state';
import { URGENCY_BARS, URGENCY_BUBBLES, URGENCY_LABELS, URGENCY_TONES } from '../urgency';

import { AssignInquiryButton, MarkContactedButton } from './pending-actions';
import { PendingFocusTabs, type PendingFocusTile } from './pending-focus';

function withQuery(path: string, params: Readonly<Record<string, string>>): Route {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ''),
  ).toString();
  // typedRoutes no verifica un string armado: las rutas son las de cada módulo.
  return `${path}${query === '' ? '' : `?${query}`}` as Route;
}

/** Una ruta armada con un ID: typedRoutes no la puede verificar. */
function route(path: string): Route {
  return path as Route;
}

function inquirySubject(row: UnassignedInquiryRow): string {
  const channel = CONTACT_CHANNEL_LABELS[row.channel] ?? row.channel;
  const subject = row.propertyCode ?? row.developmentName;
  return subject === undefined ? channel : `${channel} · ${subject}`;
}

function alertHref(row: PortalAlertRow): Route {
  return row.owner.kind === 'property'
    ? route(`/propiedades/${row.owner.id}?tab=difusion`)
    : route(`/emprendimientos/${row.owner.id}?tab=difusion`);
}

function alertSubject(row: PortalAlertRow): string {
  return row.owner.kind === 'property' ? `${row.owner.code} · ${row.owner.title}` : row.owner.name;
}

const URGENCY_RANK: Readonly<Record<UrgencyValue, number>> = { overdue: 2, warning: 1, ok: 0 };

/**
 * La tarjeta que se ve abajo: la de la URL si está visible; si no, la más urgente (a igual
 * urgencia, la que tiene algo pendiente, y después en el orden de la franja).
 */
function focusOf(
  requested: string | undefined,
  widgets: readonly { readonly key: PendingFocus; readonly widget: HomeWidget<unknown> }[],
): PendingFocus | undefined {
  const asked = widgets.find((w) => w.key === requested);
  if (asked) return asked.key;
  const score = (widget: HomeWidget<unknown>) =>
    URGENCY_RANK[widget.urgency] * 2 + (widget.total > 0 ? 1 : 0);
  return [...widgets].sort((a, b) => score(b.widget) - score(a.widget))[0]?.key;
}

// ---------- Tarjetas ----------

/** El cuerpo de una tarjeta de la franja: total, urgencia y el caso más urgente. */
function TileBody({
  icon: Icon,
  label,
  unit,
  widget,
  detail,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly unit: string;
  readonly widget: HomeWidget<unknown>;
  readonly detail: ReactNode;
}) {
  const { urgency, total } = widget;
  return (
    <span className="relative flex flex-1 flex-col gap-2 p-4 pt-5 sm:gap-3 sm:p-5 sm:pt-6">
      {/* En la tarjeta activa (`aria-selected`) no va: ya la marca el borde. */}
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-1 group-aria-selected:hidden',
          URGENCY_BARS[urgency],
        )}
        aria-hidden
      />
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full',
            URGENCY_BUBBLES[urgency],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="line-clamp-2 sm:truncate">{label}</span>
      </span>
      <span className="flex flex-wrap items-end justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="text-3xl leading-none font-bold tabular-nums sm:text-4xl">{total}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </span>
        {total > 0 && (
          <StatusPill tone={URGENCY_TONES[urgency]}>{URGENCY_LABELS[urgency]}</StatusPill>
        )}
      </span>
      {/* En el celular, la tarjeta es solo el filtro: el detalle está en la lista. */}
      <span className="hidden text-sm text-muted-foreground sm:block">{detail}</span>
    </span>
  );
}

function AllClear({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-success-600 dark:text-success-300">
      <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

function Strong({ children }: { readonly children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

// ---------- Lista ----------

function Widget<T>({
  title,
  icon: Icon,
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
  const rest = state.kind === 'ok' ? state.value.total - state.value.items.length : 0;
  return (
    <Card data-tour="home-pending-list" className="gap-0 p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-bold">
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver todas
        </Link>
      </div>
      <div className="flex flex-col px-5 py-1">
        {state.kind === 'error' ? (
          <p role="alert" className="py-3 text-sm text-danger-700 dark:text-danger-300">
            {state.message}
          </p>
        ) : state.value.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success-50 text-success-600 dark:bg-success-700/30 dark:text-success-300">
              <CheckCircle2Icon className="size-6" aria-hidden />
            </span>
            <p className="text-base font-semibold">Todo al día</p>
            <p className="text-sm text-muted-foreground">{empty}</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">{children(state.value.items)}</ul>
        )}
        {rest > 0 && (
          <Link
            href={href}
            className="border-t border-border py-3 text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver {rest === 1 ? 'la otra' : `las otras ${String(rest)}`}
          </Link>
        )}
      </div>
    </Card>
  );
}

/** Una fila: a la izquierda quién o qué y su antigüedad; a la derecha (o abajo), las acciones. */
function Row({
  urgency,
  avatar,
  title,
  age,
  detail,
  quote,
  actions,
}: {
  readonly urgency: UrgencyValue;
  readonly avatar: ReactNode;
  readonly title: ReactNode;
  readonly age: string;
  readonly detail: ReactNode;
  readonly quote?: string | undefined;
  readonly actions: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold',
            URGENCY_BUBBLES[urgency],
          )}
          aria-hidden
        >
          {avatar}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
            <StatusPill tone={URGENCY_TONES[urgency]}>{age}</StatusPill>
          </div>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
          {quote !== undefined && (
            <p className="line-clamp-2 border-l-2 border-border pl-2 text-sm text-muted-foreground">
              {quote}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 pl-13 md:justify-end md:pl-0">{actions}</div>
    </li>
  );
}

function WhatsAppButton({ phone }: { readonly phone: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={whatsappHref(phone)} target="_blank" rel="noreferrer">
        <WhatsAppIcon className="h-4 w-4" aria-hidden />
        WhatsApp
      </a>
    </Button>
  );
}

function CallButton({ phone }: { readonly phone: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={`tel:${phone}`}>
        <PhoneIcon className="h-4 w-4" aria-hidden />
        Llamar
      </a>
    </Button>
  );
}

// ---------- Vista ----------

/**
 * La pestaña Pendientes: arriba, una tarjeta por pendiente con su total y su urgencia, que funciona
 * como filtro; abajo, solo la lista de la tarjeta activa, con las acciones de cada fila.
 */
export function PendingView({
  inquiries,
  opportunities,
  signings,
  alerts,
  focus,
  filters,
  pickAgents,
  now,
}: {
  readonly inquiries: WidgetState<HomeWidget<UnassignedInquiryRow>>;
  readonly opportunities: WidgetState<HomeWidget<PendingOpportunityRow>>;
  readonly signings: WidgetState<HomeWidget<UpcomingSigningRow>>;
  readonly alerts: WidgetState<HomeWidget<PortalAlertRow>>;
  /** La tarjeta pedida en la URL (`?pendiente=`), sin validar. */
  readonly focus: string | undefined;
  readonly filters: HomeFilterValues;
  /** Elegir el agente al asignar una consulta (`users:read`). */
  readonly pickAgents: boolean;
  readonly now: Date;
}) {
  const states: Readonly<Record<PendingFocus, WidgetState<HomeWidget<unknown>>>> = {
    consultas: inquiries,
    contactar: opportunities,
    firmas: signings,
    avisos: alerts,
  };
  const visible = PENDING_FOCUS_VALUES.filter((key) => states[key].kind !== 'hidden');
  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés pendientes para mostrar con tus permisos.
      </p>
    );
  }
  const loaded = PENDING_FOCUS_VALUES.flatMap((key) => {
    const state = states[key];
    return state.kind === 'ok' ? [{ key, widget: state.value }] : [];
  });
  const active = focusOf(focus, loaded) ?? visible[0] ?? 'consultas';

  const tiles: PendingFocusTile[] = [];
  if (inquiries.kind === 'ok') {
    tiles.push({
      key: 'consultas',
      label: 'Consultas sin asignar',
      content: inquiriesTile(inquiries.value, now),
    });
  }
  if (opportunities.kind === 'ok') {
    tiles.push({
      key: 'contactar',
      label: 'Pendientes de contactar',
      content: opportunitiesTile(opportunities.value, now),
    });
  }
  if (signings.kind === 'ok') {
    tiles.push({ key: 'firmas', label: 'Próximas firmas', content: signingsTile(signings.value) });
  }
  if (alerts.kind === 'ok') {
    tiles.push({
      key: 'avisos',
      label: 'Avisos con problemas',
      content: alertsTile(alerts.value, now),
    });
  }

  const list = {
    consultas: () => (
      <Widget
        title="Consultas sin asignar"
        icon={InboxIcon}
        state={inquiries}
        href={withQuery('/consultas', { branchId: filters.branchId })}
        empty="No hay consultas esperando un agente."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              urgency={row.urgency}
              avatar={initials(row.senderName ?? '?')}
              title={row.senderName ?? 'Sin nombre'}
              age={formatAge(row.receivedAt, now)}
              detail={
                row.propertyId === undefined ? (
                  inquirySubject(row)
                ) : (
                  <Link
                    href={route(`/propiedades/${row.propertyId}`)}
                    className="underline-offset-4 hover:underline"
                  >
                    {inquirySubject(row)}
                  </Link>
                )
              }
              quote={row.message}
              actions={
                <>
                  {row.senderPhone !== undefined && <WhatsAppButton phone={row.senderPhone} />}
                  <AssignInquiryButton inquiry={row} pickAgents={pickAgents} />
                </>
              }
            />
          ))
        }
      </Widget>
    ),
    contactar: () => (
      <Widget
        title="Pendientes de contactar"
        icon={PhoneCallIcon}
        state={opportunities}
        href={withQuery('/oportunidades', { category: 'new', ...filters })}
        empty="Todos los contactos nuevos ya tienen respuesta."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              urgency={row.urgency}
              avatar={initials(row.clientName ?? '?')}
              title={
                <Link
                  href={route(`/contactos/${row.clientId}`)}
                  className="underline-offset-4 hover:underline"
                >
                  {row.clientName ?? 'Sin nombre'}
                </Link>
              }
              age={formatAge(row.waitingSince, now)}
              detail={[
                row.originChannel === undefined
                  ? undefined
                  : (CONTACT_CHANNEL_LABELS[row.originChannel] ?? row.originChannel),
                row.agent?.name ?? (row.agent === undefined ? 'Sin agente' : undefined),
              ]
                .filter((part) => part !== undefined)
                .join(' · ')}
              actions={
                <>
                  {row.clientPhone !== undefined && (
                    <>
                      <WhatsAppButton phone={row.clientPhone} />
                      <CallButton phone={row.clientPhone} />
                    </>
                  )}
                  <MarkContactedButton
                    opportunityId={row.id}
                    clientName={row.clientName ?? 'La oportunidad'}
                  />
                </>
              }
            />
          ))
        }
      </Widget>
    ),
    firmas: () => (
      <Widget
        title="Próximas firmas"
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
              urgency={row.urgency}
              avatar={<CalendarClockIcon className="size-4" />}
              title={`${row.propertyCode} · ${row.propertyTitle}`}
              age={
                row.overdue
                  ? `Vencida el ${formatDateOnly(row.estimatedSigningDate)}`
                  : `Firma ${formatDateOnly(row.estimatedSigningDate)}`
              }
              detail={[`Reserva de ${row.clientName ?? 'cliente sin nombre'}`, row.agent?.name]
                .filter((part) => part !== undefined)
                .join(' · ')}
              actions={
                <Button asChild size="sm" variant="outline">
                  <Link href={route(`/propiedades/${row.propertyId}?tab=reservas`)}>
                    Ver la reserva
                    <ArrowRightIcon className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              }
            />
          ))
        }
      </Widget>
    ),
    avisos: () => (
      <Widget
        title="Avisos con problemas"
        icon={MegaphoneIcon}
        state={alerts}
        href={route('/mi-empresa/portales')}
        empty="Los avisos de los portales están publicados sin problemas."
      >
        {(rows) =>
          rows.map((row) => (
            <Row
              key={row.id}
              urgency={row.urgency}
              avatar={<MegaphoneIcon className="size-4" />}
              title={alertSubject(row)}
              age={row.status === 'error' ? 'Con error' : 'Pausado'}
              detail={`${PORTAL_LABELS[row.portal]} · ${formatAge(row.since, now)}`}
              quote={row.lastError}
              actions={
                <Button asChild size="sm">
                  <Link href={alertHref(row)}>
                    <WrenchIcon className="h-4 w-4" aria-hidden />
                    Corregir el aviso
                  </Link>
                </Button>
              }
            />
          ))
        }
      </Widget>
    ),
  } satisfies Record<PendingFocus, () => ReactNode>;

  if (tiles.length === 0) return list[active]();
  return (
    <PendingFocusTabs active={active} tiles={tiles}>
      {list[active]()}
    </PendingFocusTabs>
  );
}

function inquiriesTile(widget: HomeWidget<UnassignedInquiryRow>, now: Date): ReactNode {
  const oldest = widget.items[0];
  return (
    <TileBody
      icon={InboxIcon}
      label="Consultas sin asignar"
      unit={widget.total === 1 ? 'consulta' : 'consultas'}
      widget={widget}
      detail={
        oldest === undefined ? (
          <AllClear>Ninguna consulta espera un agente.</AllClear>
        ) : (
          <>
            La más vieja es de <Strong>{oldest.senderName ?? 'alguien sin nombre'}</Strong>,{' '}
            {formatAge(oldest.receivedAt, now)}.
          </>
        )
      }
    />
  );
}

function opportunitiesTile(widget: HomeWidget<PendingOpportunityRow>, now: Date): ReactNode {
  const first = widget.items[0];
  return (
    <TileBody
      icon={PhoneCallIcon}
      label="Pendientes de contactar"
      unit={widget.total === 1 ? 'contacto' : 'contactos'}
      widget={widget}
      detail={
        first === undefined ? (
          <AllClear>Todos los contactos nuevos tienen respuesta.</AllClear>
        ) : (
          <>
            <Strong>{first.clientName ?? 'Sin nombre'}</Strong> espera una respuesta desde{' '}
            {formatAge(first.waitingSince, now)}.
          </>
        )
      }
    />
  );
}

function signingsTile(widget: HomeWidget<UpcomingSigningRow>): ReactNode {
  const next = widget.items[0];
  return (
    <TileBody
      icon={CalendarClockIcon}
      label="Próximas firmas"
      unit={widget.total === 1 ? 'reserva' : 'reservas'}
      widget={widget}
      detail={
        next === undefined ? (
          <AllClear>No hay firmas en los próximos 30 días.</AllClear>
        ) : next.overdue ? (
          <>
            La de <Strong>{next.propertyCode}</Strong> se pasó de la fecha (
            {formatDateOnly(next.estimatedSigningDate)}) y sigue sin firmarse.
          </>
        ) : (
          <>
            La próxima es la de <Strong>{next.propertyCode}</Strong>, el{' '}
            {formatDateOnly(next.estimatedSigningDate)}.
          </>
        )
      }
    />
  );
}

function alertsTile(widget: HomeWidget<PortalAlertRow>, now: Date): ReactNode {
  const first = widget.items[0];
  return (
    <TileBody
      icon={MegaphoneIcon}
      label="Avisos con problemas"
      unit={widget.total === 1 ? 'aviso' : 'avisos'}
      widget={widget}
      detail={
        first === undefined ? (
          <AllClear>Los avisos de los portales están sin problemas.</AllClear>
        ) : (
          <>
            <Strong>{first.owner.kind === 'property' ? first.owner.code : first.owner.name}</Strong>{' '}
            {first.status === 'error' ? 'no se pudo publicar' : 'está pausado'} en{' '}
            {PORTAL_LABELS[first.portal]} ({formatAge(first.since, now)}).
          </>
        )
      }
    />
  );
}
