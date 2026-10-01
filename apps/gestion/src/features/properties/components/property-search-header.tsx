'use client';

import type { FavoriteSearchRow, PropertyLayoutValue } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { PlusIcon } from 'lucide-react';

import { FavoriteSearchesMenu } from './favorite-searches-menu';
import { LayoutSwitcher } from './layout-switcher';
import { PropertiesToolbar, type PropertyFilterValues } from './properties-toolbar';

/**
 * Lo de arriba del buscador, igual en la lista, las tarjetas y el mapa: filtros, búsquedas
 * favoritas, vista y alta.
 */
export function PropertySearchHeader({
  layout,
  filters,
  sortsByPrice,
  canSeeTrash,
  canCreate,
  favoriteSearches,
  onCreate,
}: {
  readonly layout: PropertyLayoutValue;
  readonly filters: PropertyFilterValues;
  readonly sortsByPrice: boolean;
  readonly canSeeTrash: boolean;
  readonly canCreate: boolean;
  readonly favoriteSearches: readonly FavoriteSearchRow[];
  readonly onCreate: () => void;
}) {
  const inTrash = filters.view === 'trash';
  return (
    <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-start">
      <PropertiesToolbar filters={filters} sortsByPrice={sortsByPrice} canSeeTrash={canSeeTrash} />
      <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
        <FavoriteSearchesMenu searches={favoriteSearches} />
        {!inTrash && <LayoutSwitcher layout={layout} />}
        {canCreate && !inTrash && (
          <Button type="button" onClick={onCreate}>
            <PlusIcon className="h-4 w-4" />
            Nueva propiedad
          </Button>
        )}
      </div>
    </div>
  );
}
