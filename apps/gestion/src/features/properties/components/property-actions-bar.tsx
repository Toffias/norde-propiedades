'use client';

import type { FavoriteSearchRow, PropertyLayoutValue } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { BookmarkPlusIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { SaveSearchForClientSheet } from '../../clients/components/save-search-for-client-sheet';
import { ListNavigationProvider } from '../../shared/components/server-data-table';
import { FavoriteSearchesMenu } from './favorite-searches-menu';
import { LayoutSwitcher } from './layout-switcher';
import type { PropertyFilterValues } from './properties-toolbar';

/**
 * Las acciones de arriba del buscador, igual en la lista, las tarjetas y el mapa: la vista a la
 * izquierda; búsquedas favoritas, guardar la búsqueda para un contacto y alta a la derecha. Los
 * filtros van debajo, en la cabecera de cada vista.
 */
export function PropertyActionsBar({
  layout,
  filters,
  canCreate,
  canSaveForClient,
  favoriteSearches,
  onCreate,
}: {
  readonly layout: PropertyLayoutValue;
  readonly filters: PropertyFilterValues;
  readonly canCreate: boolean;
  /** Editar contactos: guardarles búsquedas (#11). */
  readonly canSaveForClient: boolean;
  readonly favoriteSearches: readonly FavoriteSearchRow[];
  readonly onCreate: () => void;
}) {
  const inTrash = filters.view === 'trash';
  const [saving, setSaving] = useState(false);
  return (
    <ListNavigationProvider>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {/* La papelera solo se ve en lista. */}
        {!inTrash && <LayoutSwitcher layout={layout} />}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
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
          {canCreate && !inTrash && (
            <Button type="button" onClick={onCreate}>
              <PlusIcon className="h-4 w-4" />
              Nueva propiedad
            </Button>
          )}
        </div>
      </div>
      {saving && (
        <SaveSearchForClientSheet filters={filters} open={saving} onOpenChange={setSaving} />
      )}
    </ListNavigationProvider>
  );
}
