import type { ListingOwnerKindValue, PortalValue } from '@norde/core/portals/contracts';
import type {
  PortalKindOverview,
  PublicationBucketValue,
  PublicationOverview,
} from '@norde/core/reporting/contracts';
import { Card } from '@norde/ui/components/card';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ArrowRightIcon, GlobeIcon, LayersIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PortalMark } from '../../portals/components/portal-account-facts';
import { PORTAL_LABELS } from '../../portals/messages';
import { OWNER_KIND_LABELS } from '../labels';
import { portalPath } from '../paths';

const KINDS: readonly ListingOwnerKindValue[] = ['property', 'development'];

/** Los pendientes de un portal que se muestran como chips, con el texto de cada uno. */
const ALERTS: readonly { bucket: PublicationBucketValue; tone: StatusTone; label: string }[] = [
  { bucket: 'missing', tone: 'amber', label: 'sin publicar' },
  { bucket: 'review', tone: 'amber', label: 'a revisar' },
  { bucket: 'error', tone: 'red', label: 'con error' },
];

/**
 * Resumen de Difusión: una tarjeta con lo disponible y una por canal (la web y cada portal
 * prendido), con cuánto de lo disponible cubre y lo que queda pendiente.
 */
export function PublicationSummary({ overview }: { readonly overview: PublicationOverview }) {
  const availability = { property: overview.properties, development: overview.developments };
  // En desktop, todas en una fila; con más de cuatro, de a tres para que no queden angostas.
  const columns =
    overview.portals.length === 0
      ? undefined
      : overview.portals.length === 2
        ? 'xl:grid-cols-4'
        : 'xl:grid-cols-3';

  return (
    <div data-tour="publications-summary" className={cn('grid gap-4 sm:grid-cols-2', columns)}>
      <ChannelCard
        title="Para difundir"
        leading={
          <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-muted px-2">
            <LayersIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
        }
      >
        <StockFact
          label="Propiedades disponibles"
          value={overview.properties.available}
          href="/propiedades"
          linkLabel="Ver propiedades"
        />
        <StockFact
          label="Emprendimientos en comercialización"
          value={overview.developments.available}
          href="/emprendimientos"
          linkLabel="Ver emprendimientos"
        />
      </ChannelCard>

      <ChannelCard
        title="Sitio web"
        leading={
          <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-muted px-2">
            <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
        }
      >
        {KINDS.map((kind) => {
          const { available, onWeb } = availability[kind];
          const off = available - onWeb;
          return (
            <Coverage key={kind} kind={kind} value={onWeb} total={available}>
              {off > 0 && <StatusPill tone="gray">{off} fuera de la web</StatusPill>}
            </Coverage>
          );
        })}
      </ChannelCard>

      {overview.portals.map(({ portal, kinds }) => (
        <ChannelCard
          key={portal}
          title={PORTAL_LABELS[portal]}
          leading={<PortalMark portal={portal} />}
          action={
            kinds[0] && (
              <Link
                href={portalPath(portal, kinds[0].kind)}
                className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-primary hover:underline"
              >
                Ver publicaciones
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            )
          }
        >
          {KINDS.map((kind) => {
            const own = kinds.find((k) => k.kind === kind);
            return own === undefined ? (
              <NotPublished key={kind} kind={kind} />
            ) : (
              <Coverage
                key={kind}
                kind={kind}
                value={own.publishedOwners}
                total={availability[kind].available}
              >
                <PortalAlerts portal={portal} own={own} />
              </Coverage>
            );
          })}
        </ChannelCard>
      ))}
    </div>
  );
}

/** Lo disponible de un tipo, alineado con las filas de los canales de al lado. */
function StockFact({
  label,
  value,
  href,
  linkLabel,
}: {
  readonly label: string;
  readonly value: number;
  readonly href: Route;
  readonly linkLabel: string;
}) {
  return (
    <section className="flex flex-1 flex-col gap-2 py-4">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <p className="font-display text-4xl leading-none font-semibold tabular-nums">{value}</p>
      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
      >
        {linkLabel}
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

function ChannelCard({
  title,
  leading,
  action,
  children,
}: {
  readonly title: string;
  readonly leading: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-bold">
          {leading}
          <span className="truncate">{title}</span>
        </h2>
        {action !== undefined && <div className="-my-1.5 shrink-0">{action}</div>}
      </div>
      <div className="flex flex-1 flex-col divide-y divide-border px-5">{children}</div>
    </Card>
  );
}

/** Cuánto de lo disponible de un tipo está en el canal: "24 / 66", el porcentaje y una barra. */
function Coverage({
  kind,
  value,
  total,
  children,
}: {
  readonly kind: ListingOwnerKindValue;
  readonly value: number;
  readonly total: number;
  readonly children: ReactNode;
}) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <section className="flex flex-col gap-2 py-4">
      <h3 className="text-xs font-medium text-muted-foreground">{OWNER_KIND_LABELS[kind]}</h3>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-2xl leading-none font-semibold tabular-nums">
          {value}
          <span className="text-sm font-medium text-muted-foreground"> / {total}</span>
        </p>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-success-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex min-h-6 flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function PortalAlerts({
  portal,
  own,
}: {
  readonly portal: PortalValue;
  readonly own: PortalKindOverview;
}) {
  return ALERTS.filter(({ bucket }) => own.counts[bucket] > 0).map(({ bucket, tone, label }) => (
    <Link
      key={bucket}
      href={portalPath(portal, own.kind, bucket)}
      className="rounded-full transition-opacity hover:opacity-80"
    >
      <StatusPill tone={tone}>
        {own.counts[bucket]} {label}
      </StatusPill>
    </Link>
  ));
}

function NotPublished({ kind }: { readonly kind: ListingOwnerKindValue }) {
  return (
    <section className="flex flex-col gap-2 py-4">
      <h3 className="text-xs font-medium text-muted-foreground">{OWNER_KIND_LABELS[kind]}</h3>
      <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        No se publican en este portal.
      </p>
    </section>
  );
}
