'use client';

import type { NewsCard, NewsPeriod } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import { cn } from '@norde/ui/lib/utils';
import { useState } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { loadNewsPageAction } from '../actions';
import { newsSectionAnchor, type NewsSection as NewsSectionConfig } from '../news-sections';
import { NewsContactRow } from './news-contact-row';
import { NewsPropertyCard } from './news-property-card';
import { KIND_TONES, KindIcon, TONE_SOFT } from './news-visuals';

interface SectionState {
  readonly cards: readonly NewsCard[];
  readonly total: number;
  readonly page: number;
  readonly loading: boolean;
  readonly error: string | undefined;
}

function cardKey(card: NewsCard): string {
  return `${card.entityType}|${card.entityId}|${card.day}`;
}

/**
 * Una sección del resumen: las novedades de un tipo en el período, en tarjetas (propiedades) o en
 * lista (contactos). Cada tanda se pide al servidor con "Ver más".
 */
export function NewsSection({
  section,
  initial,
  period,
  today,
}: {
  readonly section: NewsSectionConfig;
  readonly initial: Page<NewsCard>;
  readonly period: NewsPeriod;
  readonly today: string;
}) {
  const [state, setState] = useState<SectionState>({
    cards: initial.items,
    total: initial.total,
    page: initial.page,
    loading: false,
    error: undefined,
  });
  const hasMore = state.page * initial.pageSize < state.total;
  const remaining = state.total - state.cards.length;
  const showDay = period === 'week';

  function loadMore() {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    void loadNewsPageAction({
      kinds: [section.kind],
      period,
      page: state.page + 1,
      pageSize: initial.pageSize,
    })
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

  return (
    <section
      id={newsSectionAnchor(section.kind)}
      aria-labelledby={`${newsSectionAnchor(section.kind)}-titulo`}
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            TONE_SOFT[KIND_TONES[section.kind]],
          )}
          aria-hidden
        >
          <KindIcon kind={section.kind} className="size-4" />
        </span>
        <h2
          id={`${newsSectionAnchor(section.kind)}-titulo`}
          className="text-sm font-semibold text-foreground"
        >
          {section.title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-px text-xs font-semibold text-muted-foreground tabular-nums">
          {state.total}
        </span>
      </div>

      {section.layout === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.cards.map((card) => (
            <NewsPropertyCard key={cardKey(card)} card={card} today={today} showDay={showDay} />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {state.cards.map((card) => (
            <NewsContactRow key={cardKey(card)} card={card} today={today} showDay={showDay} />
          ))}
        </ul>
      )}

      {state.error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {(hasMore || state.error !== undefined) && (
        <div>
          <Button variant="outline" size="sm" onClick={loadMore} disabled={state.loading}>
            {state.loading
              ? 'Cargando…'
              : state.error !== undefined
                ? 'Reintentar'
                : `Ver ${String(Math.min(remaining, initial.pageSize))} más`}
          </Button>
        </div>
      )}
    </section>
  );
}
