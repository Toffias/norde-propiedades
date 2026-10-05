'use client';

import type { NewsCard as NewsCardData, NewsKindValue } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import { NewspaperIcon } from 'lucide-react';
import { cn } from '@norde/ui/lib/utils';
import { Fragment, useState } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { loadNewsPageAction } from '../actions';
import { newsDayLabel, newsDayOf } from '../news-format';
import { NewsCard } from './news-card';

interface FeedState {
  readonly cards: readonly NewsCardData[];
  readonly total: number;
  readonly page: number;
  readonly loading: boolean;
  readonly error: string | undefined;
}

function cardKey(card: NewsCardData): string {
  return `${card.entityType}|${card.entityId}|${card.day}`;
}

/**
 * El feed de Noticias: tarjetas agrupadas por día. Cada tanda se pide al servidor con "Ver más";
 * una tarjeta que ya está (porque entraron novedades nuevas) no se repite.
 */
export function NewsFeed({
  initial,
  kinds,
}: {
  readonly initial: Page<NewsCardData>;
  readonly kinds: readonly NewsKindValue[];
}) {
  const [state, setState] = useState<FeedState>({
    cards: initial.items,
    total: initial.total,
    page: initial.page,
    loading: false,
    error: undefined,
  });
  const hasMore = state.page * initial.pageSize < state.total && state.error === undefined;
  const today = newsDayOf(new Date());

  function loadMore() {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    void loadNewsPageAction({ page: state.page + 1, pageSize: initial.pageSize, kinds: [...kinds] })
      .then((result) => {
        setState((current) => {
          if (!result.ok) return { ...current, loading: false, error: result.message };
          const seen = new Set(current.cards.map(cardKey));
          return {
            cards: [
              ...current.cards,
              ...result.value.items.filter((card) => !seen.has(cardKey(card))),
            ],
            total: result.value.total,
            page: result.value.page,
            loading: false,
            error: undefined,
          };
        });
      })
      .catch(() => {
        setState((current) => ({ ...current, loading: false, error: UNEXPECTED_ERROR_MESSAGE }));
      });
  }

  if (kinds.length === 0) {
    return <EmptyFeed text="Elegí al menos un tipo de noticia para ver el feed." />;
  }
  if (state.cards.length === 0) {
    return <EmptyFeed text="Todavía no hay noticias de los tipos elegidos." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {state.cards.map((card, index) => {
        const previous = state.cards[index - 1];
        const newDay = previous?.day !== card.day;
        return (
          <Fragment key={cardKey(card)}>
            {newDay && <DayHeading day={card.day} today={today} />}
            <NewsCard card={card} />
          </Fragment>
        );
      })}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={state.loading}>
            {state.loading ? 'Cargando…' : 'Ver más noticias'}
          </Button>
        </div>
      )}
      {state.error !== undefined && (
        <div role="alert" className="flex flex-col items-center gap-2 py-4 text-sm">
          <p className="text-destructive">{state.error}</p>
          <Button variant="outline" size="sm" onClick={loadMore}>
            Reintentar
          </Button>
        </div>
      )}
      {!hasMore && state.error === undefined && (
        <p className="py-4 text-center text-xs text-muted-foreground">No hay más noticias.</p>
      )}
    </div>
  );
}

/** "Hoy" lleva el color de la marca; los demás días, gris. */
function DayHeading({ day, today }: { readonly day: string; readonly today: string }) {
  const isToday = day === today;
  return (
    <h2
      className={cn(
        'flex items-center gap-3 pt-3 text-sm font-semibold first:pt-0',
        isToday ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {isToday && <span className="size-2 rounded-full bg-primary-500" aria-hidden />}
      {newsDayLabel(day, today)}
      <span
        className={cn('h-px flex-1', isToday ? 'bg-primary-500/30' : 'bg-border')}
        aria-hidden
      />
    </h2>
  );
}

function EmptyFeed({ text }: { readonly text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <NewspaperIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
