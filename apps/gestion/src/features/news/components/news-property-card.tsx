'use client';

import type { NewsCard, NewsEntryRow, NewsPropertyHeader } from '@norde/core/audit/contracts';
import { Badge } from '@norde/ui/components/badge';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ArrowRightIcon, BuildingIcon } from 'lucide-react';
import Link from 'next/link';

import { formatMoney, formatTime } from '../../../lib/format';
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../../properties/labels';
import { PropertyPhoto } from '../../properties/components/property-photo';
import { newsAuthor, newsLines, newsShortDayLabel, type NewsLine } from '../news-format';
import { TONE_TEXT, entityUrl, EntryIcon, entryTone, statusChange } from './news-visuals';

/** El precio actual de la primera operación, para una propiedad recién cargada. */
function currentPrice(header: NewsPropertyHeader) {
  const operation = header.operations[0];
  if (operation === undefined) return undefined;
  return {
    price:
      operation.priceCents === null
        ? 'Precio a consultar'
        : formatMoney({ amountCents: operation.priceCents, currency: operation.currency }),
    operation: header.operations.map((o) => OPERATION_LABELS[o.operation]).join(' y '),
  };
}

const RESERVATION_HIGHLIGHTS: Readonly<Record<string, string>> = {
  'property.reserved': 'Reservada',
  'property.reservation_fallen': 'Reserva caída',
  'property.reservation_signed': 'Reserva firmada',
};

/** La pastilla sobre la foto: lo que cambió, en dos o tres palabras. */
function highlightOf(entry: NewsEntryRow, line: NewsLine | undefined, header: NewsPropertyHeader) {
  switch (entry.kind) {
    case 'property.price_changed':
      return line?.price?.percent ?? (line?.trend === 'down' ? 'Bajó' : 'Cambió el precio');
    case 'property.status_changed':
      return statusChange(entry)?.after.label ?? 'Cambió el estado';
    case 'property.created':
      return 'Nueva';
    case 'property.reservation':
      return RESERVATION_HIGHLIGHTS[entry.action] ?? 'Reserva';
    case 'property.operation_changed':
      return header.operations.map((o) => OPERATION_LABELS[o.operation]).join(' y ');
    case 'client.created':
    case 'client.reassigned':
    case 'client.deleted':
      return undefined;
  }
}

function Change({
  entry,
  lines,
  header,
}: {
  readonly entry: NewsEntryRow;
  readonly lines: readonly NewsLine[];
  readonly header: NewsPropertyHeader;
}) {
  if (entry.kind === 'property.status_changed') {
    const status = statusChange(entry);
    if (status !== undefined) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{status.before.label}</Badge>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <StatusPill tone={status.after.tone}>{status.after.label}</StatusPill>
        </div>
      );
    }
  }
  if (entry.kind === 'property.created') {
    const current = currentPrice(header);
    if (current !== undefined) {
      return (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-semibold whitespace-nowrap text-foreground tabular-nums">
            {current.price}
          </span>
          <span className="text-xs text-muted-foreground">{current.operation}</span>
        </p>
      );
    }
  }
  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line, index) =>
        line.price === undefined ? (
          <p key={`${String(index)}-${line.text}`} className="text-sm text-foreground/90">
            {line.text}
          </p>
        ) : (
          <p
            key={`${String(index)}-${line.text}`}
            className="flex flex-wrap items-baseline gap-x-2"
          >
            <span className="text-lg font-semibold whitespace-nowrap text-foreground tabular-nums">
              {line.price.now}
            </span>
            <s className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
              {line.price.before}
            </s>
            <span className="text-xs text-muted-foreground">
              {line.text.replace(/^El precio de /, '').replace(/ (subió|bajó) a$/, '')}
            </span>
          </p>
        ),
      )}
    </div>
  );
}

/**
 * Una propiedad en una sección del resumen: la foto con lo que cambió, el título y el cambio
 * más reciente de ese día. Si hubo más del mismo tipo ese día, se ven en el historial.
 */
export function NewsPropertyCard({
  card,
  today,
  showDay,
}: {
  readonly card: NewsCard;
  readonly today: string;
  readonly showDay: boolean;
}) {
  const [latest] = card.entries;
  const header = card.header?.entityType === 'property' ? card.header : undefined;
  if (latest === undefined) return null;
  const lines = newsLines(latest);
  const tone = entryTone(latest, lines[0]);
  const more = card.entries.length - 1 + card.moreCount;
  const when = showDay
    ? `${newsShortDayLabel(card.day, today)} · ${formatTime(latest.occurredAt)}`
    : formatTime(latest.occurredAt);

  if (header === undefined) {
    return (
      <article className="flex flex-col justify-center gap-1 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p>Una propiedad que ya no existe</p>
        <p className="text-xs">
          {lines[0]?.text} · {when}
        </p>
      </article>
    );
  }

  const highlight = highlightOf(latest, lines[0], header);
  const location = header.neighborhood.trim() === '' ? '' : ` en ${header.neighborhood}`;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <Link
        href={entityUrl(card)}
        className="relative block aspect-[16/9] bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        tabIndex={-1}
        aria-hidden
      >
        <PropertyPhoto
          propertyId={card.entityId}
          cover={header.cover}
          className="size-full object-cover"
          fallback={
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <BuildingIcon className="size-7" />
            </span>
          }
        />
        {highlight !== undefined && (
          <span
            className={cn(
              'absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-semibold shadow-sm ring-1 ring-black/5 tabular-nums',
              TONE_TEXT[tone],
            )}
          >
            <EntryIcon entry={latest} line={lines[0]} className="size-3.5" />
            {highlight}
          </span>
        )}
        {header.deleted && (
          <Badge variant="secondary" className="absolute top-2.5 right-2.5 shadow-sm">
            En la papelera
          </Badge>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <Link
            href={entityUrl(card)}
            className="block truncate font-semibold text-foreground hover:underline"
          >
            {header.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {header.code} · {PROPERTY_TYPE_LABELS[header.propertyType]}
            {location}
          </p>
        </div>
        <Change entry={latest} lines={lines} header={header} />
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="truncate">
            Por {newsAuthor(latest)} · {when}
          </span>
          {more > 0 && (
            <Link
              href={entityUrl(card, 'historial')}
              className="shrink-0 font-medium text-primary hover:underline"
            >
              +{more} {more === 1 ? 'cambio' : 'cambios'}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
