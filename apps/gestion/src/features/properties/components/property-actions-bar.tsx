'use client';

import type { FavoriteSearchRow, PropertyLayoutValue } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { BookmarkPlusIcon, PlusIcon, UploadIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SaveSearchForClientSheet } from '../../clients/components/save-search-for-client-sheet';
import { ListNavigationProvider } from '../../shared/components/server-data-table';
import { FavoriteSearchesMenu } from './favorite-searches-menu';
import { LayoutSwitcher } from './layout-switcher';
import type { LocationOptions, PropertyFilterValues } from './properties-toolbar';

/**
 * Las acciones de arriba del buscador, igual en la lista, las tarjetas y el mapa: la vista a la
 * izquierda; búsquedas favoritas, guardar la búsqueda para un contacto, importar de Tokko y alta a
 * la derecha. Los
 * filtros van debajo, en la cabecera de cada vista.
 */
export function PropertyActionsBar({
  layout,
  filters,
  locationOptions,
  canCreate,
  canSaveForClient,
  canTurnOnAutoSend,
  canImport,
  favoriteSearches,
  onCreate,
}: {
  readonly layout: PropertyLayoutValue;
  readonly filters: PropertyFilterValues;
  readonly locationOptions: LocationOptions;
  readonly canCreate: boolean;
  /** Editar contactos: guardarles búsquedas (#11). */
  readonly canSaveForClient: boolean;
  /** `followups:automatic`: guardarla con envío automático (#106). */
  readonly canTurnOnAutoSend: boolean;
  /** Importar la exportación de propiedades de Tokko (`properties:import`). */
  readonly canImport: boolean;
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
              data-tour="properties-save-search"
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
          {canImport && !inTrash && (
            <Button data-tour="properties-import" asChild variant="outline">
              <Link href="/propiedades/importaciones">
                <UploadIcon className="h-4 w-4" />
                Importar de Tokko
              </Link>
            </Button>
          )}
          {canCreate && !inTrash && (
            <Button data-tour="properties-new" type="button" onClick={onCreate}>
              <PlusIcon className="h-4 w-4" />
              Nueva propiedad
            </Button>
          )}
        </div>
      </div>
      {saving && (
        <SaveSearchForClientSheet
          filters={{ ...filters, locationOptions }}
          open={saving}
          onOpenChange={setSaving}
          canTurnOnAutoSend={canTurnOnAutoSend}
        />
      )}
    </ListNavigationProvider>
  );
}
