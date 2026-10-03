'use client';

import type { FavoriteSearchRow, PropertyLayoutValue } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { BookmarkPlusIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { SaveSearchForClientSheet } from '../../clients/components/save-search-for-client-sheet';
import { FavoriteSearchesMenu } from './favorite-searches-menu';
import { LayoutSwitcher } from './layout-switcher';
import { PropertiesToolbar, type PropertyFilterValues } from './properties-toolbar';

/**
 * Lo de arriba del buscador, igual en la lista, las tarjetas y el mapa: filtros, búsquedas
 * favoritas, guardar la búsqueda para un contacto, vista y alta.
 */
export function PropertySearchHeader({
  layout,
  filters,
  sortsByPrice,
  canSeeTrash,
  canCreate,
  canSaveForClient,
  favoriteSearches,
  onCreate,
}: {
  readonly layout: PropertyLayoutValue;
  readonly filters: PropertyFilterValues;
  readonly sortsByPrice: boolean;
  readonly canSeeTrash: boolean;
  readonly canCreate: boolean;
  /** Editar contactos: guardarles búsquedas (#11). */
  readonly canSaveForClient: boolean;
  readonly favoriteSearches: readonly FavoriteSearchRow[];
  readonly onCreate: () => void;
}) {
  const inTrash = filters.view === 'trash';
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-start">
      <PropertiesToolbar filters={filters} sortsByPrice={sortsByPrice} canSeeTrash={canSeeTrash} />
      <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
        <FavoriteSearchesMenu searches={favoriteSearches} />
        {canSaveForClient && !inTrash && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSaving(true);
            }}
          >
            <BookmarkPlusIcon className="h-4 w-4" />
            Guardar para un contacto
          </Button>
        )}
        {!inTrash && <LayoutSwitcher layout={layout} />}
        {canCreate && !inTrash && (
          <Button type="button" onClick={onCreate}>
            <PlusIcon className="h-4 w-4" />
            Nueva propiedad
          </Button>
        )}
      </div>
      {saving && (
        <SaveSearchForClientSheet filters={filters} open={saving} onOpenChange={setSaving} />
      )}
    </div>
  );
}
