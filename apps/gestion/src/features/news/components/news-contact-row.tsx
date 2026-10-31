'use client';

import type { NewsCard } from '@norde/core/audit/contracts';
import { Badge } from '@norde/ui/components/badge';
import { cn } from '@norde/ui/lib/utils';
import { UserIcon } from 'lucide-react';
import Link from 'next/link';

import { formatTime } from '../../../lib/format';
import { newsAuthor, newsLines, newsShortDayLabel } from '../news-format';
import { TONE_SOFT, entityUrl, entryTone } from './news-visuals';

/** Etiquetas que se ven en la fila; las demás, en la ficha. */
const VISIBLE_TAGS = 3;

/**
 * Un contacto en una sección del resumen: nombre, etiquetas y lo que pasó, en una fila de la
 * lista.
 */
export function NewsContactRow({
  card,
  today,
  showDay,
}: {
  readonly card: NewsCard;
  readonly today: string;
  readonly showDay: boolean;
}) {
  const [latest] = card.entries;
  if (latest === undefined) return null;
  const header = card.header?.entityType === 'client' ? card.header : undefined;
  const lines = newsLines(latest);
  const tone = entryTone(latest, lines[0]);
  const name =
    header?.name ?? (header === undefined ? 'Un contacto suprimido' : 'Contacto sin nombre');
  const tags = header?.tags ?? [];
  const more = card.entries.length - 1 + card.moreCount;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          TONE_SOFT[tone],
        )}
        aria-hidden
      >
        <UserIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {header === undefined || header.deleted ? (
            <span className="truncate font-semibold text-foreground">{name}</span>
          ) : (
            <Link
              href={entityUrl(card)}
              className="truncate font-semibold text-foreground hover:underline"
            >
              {name}
            </Link>
          )}
          {header?.deleted === true && <Badge variant="secondary">En la papelera</Badge>}
        </div>
        <p className="text-sm text-foreground/90">
          {lines.map((line) => line.text).join(' · ')}
          {more > 0 && header !== undefined && !header.deleted && (
            <>
              {' '}
              <Link
                href={entityUrl(card, 'historial')}
                className="text-xs font-medium whitespace-nowrap text-primary hover:underline"
              >
                +{more} {more === 1 ? 'cambio' : 'cambios'}
              </Link>
            </>
          )}
        </p>
        {tags.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Etiquetas">
            {tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <li key={tag.id}>
                <Badge variant="secondary">{tag.name}</Badge>
              </li>
            ))}
            {tags.length > VISIBLE_TAGS && (
              <li>
                <Badge variant="outline">+{tags.length - VISIBLE_TAGS}</Badge>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p className="tabular-nums">
          {showDay ? `${newsShortDayLabel(card.day, today)} · ` : ''}
          {formatTime(latest.occurredAt)}
        </p>
        <p className="max-w-32 truncate">{newsAuthor(latest)}</p>
      </div>
    </li>
  );
}
