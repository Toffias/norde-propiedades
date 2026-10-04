'use client';

import type {
  FavoriteSearchRow,
  GridColumnValue,
  PanelPropertyRow,
  PropertyLayoutValue,
  PropertyType,
} from '@norde/core/properties/contracts';
import { useMemo } from 'react';

import { usePanel } from '../../shared/components/entity-sheet';
import { ListNavigationProvider } from '../../shared/components/server-data-table';
import { PropertiesGrid, type PropertyPermissions } from './properties-grid';
import { PropertiesToolbar, type PropertyFilterValues } from './properties-toolbar';
import { PropertyActionsBar } from './property-actions-bar';
import { PropertyCards } from './property-cards';
import { PropertyMap } from './property-map';
import { PropertySheet } from './property-sheet';

export interface PropertiesViewProps {
  readonly layout: PropertyLayoutValue;
  readonly rows: readonly PanelPropertyRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: PropertyFilterValues;
  readonly permissions: PropertyPermissions;
  readonly gridColumns: readonly GridColumnValue[];
  /** Tipos habilitados en Mi empresa: los que ofrece el alta. */
  readonly enabledTypes: readonly PropertyType[];
  readonly favoriteIds: readonly string[];
  readonly favoriteSearches: readonly FavoriteSearchRow[];
}

/** El buscador de propiedades en lista, tarjetas o mapa, con el alta en el panel lateral. */
export function PropertiesView(props: PropertiesViewProps) {
  const { layout, filters, permissions } = props;
  const navigation = usePanel();
  const favoriteIds = useMemo(() => new Set(props.favoriteIds), [props.favoriteIds]);
  // La papelera solo se ve en lista.
  const effectiveLayout = filters.view === 'trash' ? 'list' : layout;

  const toolbar = (
    <PropertiesToolbar
      filters={filters}
      sortsByPrice={props.sort.field === 'price'}
      canSeeTrash={permissions.delete}
    />
  );
  const empty = Object.entries(filters).some(
    ([key, value]) => key !== 'view' && key !== 'scope' && value !== '',
  )
    ? 'No hay propiedades que coincidan con los filtros.'
    : 'Todavía no hay propiedades en la cartera.';

  return (
    <>
      <PropertyActionsBar
        layout={effectiveLayout}
        filters={filters}
        canCreate={permissions.create}
        canSaveForClient={permissions.featureToClient}
        favoriteSearches={props.favoriteSearches}
        onCreate={navigation.openNew}
      />
      {effectiveLayout === 'list' ? (
        <PropertiesGrid
          rows={props.rows}
          total={props.total}
          page={props.page}
          pageSize={props.pageSize}
          sort={props.sort}
          filters={filters}
          permissions={permissions}
          gridColumns={props.gridColumns}
          favoriteIds={favoriteIds}
          toolbar={toolbar}
        />
      ) : (
        <ListNavigationProvider>
          {effectiveLayout === 'cards' ? (
            <PropertyCards
              rows={props.rows}
              total={props.total}
              page={props.page}
              pageSize={props.pageSize}
              favoriteIds={favoriteIds}
              toolbar={toolbar}
              empty={empty}
            />
          ) : (
            <PropertyMap filters={filters} toolbar={toolbar} />
          )}
        </ListNavigationProvider>
      )}
      {permissions.create && (
        <PropertySheet navigation={navigation} enabledTypes={props.enabledTypes} />
      )}
    </>
  );
}
