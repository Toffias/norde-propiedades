'use client';

import type {
  NewsCard as NewsCardData,
  NewsEntryRow,
  NewsKindValue,
} from '@norde/core/audit/contracts';
import { Badge } from '@norde/ui/components/badge';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import {
  ArrowLeftRightIcon,
  BuildingIcon,
  CalendarCheckIcon,
  ChevronDownIcon,
  CirclePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserIcon,
  UserRoundCogIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { formatTime } from '../../../lib/format';
import {
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../../properties/labels';
import { newsAuthor, newsBadge, newsLines, type NewsLine } from '../news-format';

const KIND_BADGE_VARIANTS: Readonly<
  Record<NewsKindValue, 'success' | 'warning' | 'info' | 'secondary'>
> = {
  'client.created': 'success',
  'client.reassigned': 'info',
  'client.deleted': 'secondary',
  'property.created': 'success',
  'property.status_changed': 'info',
  'property.operation_changed': 'info',
  'property.price_changed': 'warning',
  'property.reservation': 'warning',
};

function entityUrl(card: NewsCardData, tab?: 'historial'): Route {
  const base = card.entityType === 'property' ? '/propiedades' : '/contactos';
  return `${base}/${card.entityId}${tab === undefined ? '' : `?tab=${tab}`}` as Route; // Ruta dinámica de la ficha.
}

function EntryIcon({
  entry,
  line,
  className,
}: {
  readonly entry: NewsEntryRow;
  readonly line: NewsLine | undefined;
  readonly className: string;
}) {
  if (line?.trend === 'down') return <TrendingDownIcon className={className} />;
  const icons: Readonly<Record<NewsKindValue, ReactNode>> = {
    'client.created': <CirclePlusIcon className={className} />,
    'client.reassigned': <UserRoundCogIcon className={className} />,
    'client.deleted': <Trash2Icon className={className} />,
    'property.created': <CirclePlusIcon className={className} />,
    'property.status_changed': <RefreshCwIcon className={className} />,
    'property.operation_changed': <ArrowLeftRightIcon className={className} />,
    'property.price_changed': <TrendingUpIcon className={className} />,
    'property.reservation': <CalendarCheckIcon className={className} />,
  };
  return icons[entry.kind];
}

function Entry({ entry, main }: { readonly entry: NewsEntryRow; readonly main: boolean }) {
  const lines = newsLines(entry);
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
          main ? 'size-7' : 'size-6',
        )}
        aria-hidden
      >
        <EntryIcon entry={entry} line={lines[0]} className={main ? 'size-4' : 'size-3.5'} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          {lines.map((line, index) => (
            <p
              key={`${String(index)}-${line.text}`}
              className={cn(
                'text-sm',
                main ? 'font-semibold text-foreground' : 'text-foreground/90',
              )}
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:text-right">
          <Badge variant={KIND_BADGE_VARIANTS[entry.kind]}>{newsBadge(entry.kind)}</Badge>
          <span className="text-xs text-muted-foreground">
            Por {newsAuthor(entry)} · {formatTime(entry.occurredAt)}
          </span>
        </div>
      </div>
    </li>
  );
}

function Header({ card }: { readonly card: NewsCardData }) {
  const header = card.header;
  if (header === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        {card.entityType === 'property'
          ? 'Una propiedad que ya no existe'
          : 'Un contacto suprimido'}
      </p>
    );
  }
  if (header.entityType === 'property') {
    const status = PROPERTY_STATUS_DISPLAY[header.status];
    return (
      <div className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden
        >
          <BuildingIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {header.deleted && <Badge variant="secondary">En la papelera</Badge>}
          </div>
          <Link
            href={entityUrl(card)}
            className="mt-1 block truncate font-semibold text-foreground hover:underline"
          >
            {header.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {header.code} · {PROPERTY_TYPE_LABELS[header.propertyType]}
            {header.neighborhood.trim() === '' ? '' : ` en ${header.neighborhood}`}
          </p>
        </div>
        <ul className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
          {header.operations.map((operation) => (
            <li key={operation.operation}>
              <Badge variant="outline">{OPERATION_LABELS[operation.operation]}</Badge>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <UserIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {card.header?.deleted ? (
            <span className="truncate font-semibold text-foreground">
              {header.name ?? 'Contacto sin nombre'}
            </span>
          ) : (
            <Link
              href={entityUrl(card)}
              className="truncate font-semibold text-foreground hover:underline"
            >
              {header.name ?? 'Contacto sin nombre'}
            </Link>
          )}
          {header.deleted && <Badge variant="secondary">En la papelera</Badge>}
        </div>
        {header.tags.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Etiquetas">
            {header.tags.map((tag) => (
              <li key={tag.id}>
                <Badge variant="secondary">{tag.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Una tarjeta del feed: la propiedad o el contacto, su novedad más reciente del día y las demás
 * plegadas ("2 actualizaciones más").
 */
export function NewsCard({ card }: { readonly card: NewsCardData }) {
  const [expanded, setExpanded] = useState(false);
  const [latest, ...older] = card.entries;
  const hidden = older.length;
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex flex-col gap-4 p-4">
        <Header card={card} />
        {latest !== undefined && (
          <ul className="flex flex-col gap-3">
            <Entry entry={latest} main />
          </ul>
        )}
        {expanded && hidden > 0 && (
          <ul className="ml-3 flex flex-col gap-3 border-l border-border pl-4">
            {older.map((entry) => (
              <Entry key={entry.id} entry={entry} main={false} />
            ))}
          </ul>
        )}
        {expanded && card.moreCount > 0 && (
          <Link
            href={entityUrl(card, 'historial')}
            className="ml-7 text-sm font-medium text-primary hover:underline"
          >
            Ver{' '}
            {card.moreCount === 1 ? 'otra novedad' : `otras ${String(card.moreCount)} novedades`} en
            el historial
          </Link>
        )}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
          className="flex w-full items-center justify-end gap-1 border-t border-border bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {hidden + card.moreCount === 1
            ? '1 actualización'
            : `${String(hidden + card.moreCount)} actualizaciones`}{' '}
          {expanded ? 'menos' : 'más'}
          <ChevronDownIcon
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden
          />
        </button>
      )}
    </article>
  );
}
