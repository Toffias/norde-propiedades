'use client';

import type { NewsCard as NewsCardData, NewsKindValue } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import { NewspaperIcon } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

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
 * El feed de Noticias: tarjetas agrupadas por día, con scroll infinito. Cada tanda la pide al
 * servidor; una tarjeta que ya está (porque entraron novedades nuevas) no se repite.
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
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = state.page * initial.pageSize < state.total && state.error === undefined;
  const today = newsDayOf(new Date());

  const loadMore = useCallback(() => {
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
  }, [state.page, initial.pageSize, kinds]);

  // Al llegar al final de la página, pide la tanda siguiente.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || state.loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, state.loading, loadMore]);

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
            {newDay && (
              <h2 className="flex items-center gap-3 pt-3 text-sm font-semibold text-muted-foreground first:pt-0">
                {newsDayLabel(card.day, today)}
                <span className="h-px flex-1 bg-border" aria-hidden />
              </h2>
            )}
            <NewsCard card={card} />
          </Fragment>
        );
      })}
      <div ref={sentinel} aria-hidden />
      {state.loading && (
        <p role="status" className="py-4 text-center text-sm text-muted-foreground">
          Cargando más noticias…
        </p>
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

function EmptyFeed({ text }: { readonly text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <NewspaperIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
