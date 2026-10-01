'use client';

import { PROPERTY_LAYOUT_VALUES, type PropertyLayoutValue } from '@norde/core/properties/contracts';
import { cn } from '@norde/ui/lib/utils';
import { LayoutGridIcon, ListIcon, MapIcon, type LucideIcon } from 'lucide-react';

import { useListNavigation } from '../../shared/components/server-data-table';
import { LAYOUT_LABELS } from '../labels';

const ICONS: Readonly<Record<PropertyLayoutValue, LucideIcon>> = {
  list: ListIcon,
  cards: LayoutGridIcon,
  map: MapIcon,
};

/** Lista, tarjetas o mapa: la vista va en la URL (`?layout=map`), con los mismos filtros. */
export function LayoutSwitcher({ layout }: { readonly layout: PropertyLayoutValue }) {
  const { setParams } = useListNavigation();
  return (
    <div
      role="group"
      aria-label="Cómo ver los resultados"
      className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5"
    >
      {PROPERTY_LAYOUT_VALUES.map((value) => {
        const Icon = ICONS[value];
        const active = value === layout;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={LAYOUT_LABELS[value]}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              setParams({ layout: value === 'list' ? undefined : value });
            }}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{LAYOUT_LABELS[value]}</span>
          </button>
        );
      })}
    </div>
  );
}
