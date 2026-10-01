import {
  ListPanelPropertiesQuerySchema,
  PROPERTY_LAYOUT_VALUES,
  type FavoriteSearchRow,
  type GridColumnValue,
  type PropertyLayoutValue,
  type PropertyType,
} from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { BuildingIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import { PropertiesView } from '../../../features/properties/components/properties-view';
import type { PropertyFilterValues } from '../../../features/properties/components/properties-toolbar';
import { PROPERTY_LIST_ERROR_MESSAGES } from '../../../features/properties/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Propiedades' };

/** Hasta este tope se muestran las búsquedas favoritas de un usuario (ver `MAX_FAVORITE_SEARCHES`). */
const FAVORITE_SEARCHES_PAGE = 50;

/** El valor de un param tal como está en la URL, para mostrarlo en los filtros. */
function raw(params: SearchParams, key: string, invalidKeys: readonly string[]): string {
  if (invalidKeys.includes(key)) return '';
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function layoutFrom(params: SearchParams): PropertyLayoutValue {
  const value = raw(params, 'layout', []);
  return PROPERTY_LAYOUT_VALUES.find((layout) => layout === value) ?? 'list';
}

export default async function PropertiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListPanelPropertiesQuerySchema, params);
  const { properties, identity } = getContainer();
  const [result, configuration, favoriteSearches] = await Promise.all([
    properties.listPanelProperties.execute(query, actor),
    properties.getPropertyConfiguration.execute(actor),
    properties.listFavoriteSearches.execute(
      { page: 1, pageSize: FAVORITE_SEARCHES_PAGE, sort: 'name' },
      actor,
    ),
  ]);

  const rowIds = result.isOk() ? result.value.items.map((row) => row.id) : [];
  const favorites =
    rowIds.length === 0
      ? undefined
      : await identity.getFavoriteIds.execute({ entityType: 'property', ids: rowIds }, actor);

  const filters: PropertyFilterValues = {
    q: query.q ?? '',
    location: query.location ?? '',
    operation: query.operation ?? '',
    propertyType: query.propertyType ?? '',
    status: query.status ?? '',
    scope: query.scope === 'all' ? '' : query.scope,
    currency: query.currency ?? '',
    // Los montos se muestran como se escribieron: el contract ya los pasó a centavos.
    minPrice: raw(params, 'minPrice', invalidKeys),
    maxPrice: raw(params, 'maxPrice', invalidKeys),
    view: query.view,
  };
  const gridColumns: readonly GridColumnValue[] = configuration.isOk()
    ? configuration.value.gridColumns
    : [];
  const enabledTypes: readonly PropertyType[] = configuration.isOk()
    ? configuration.value.types.filter((type) => type.isEnabled).map((type) => type.propertyType)
    : [];
  const searches: readonly FavoriteSearchRow[] = favoriteSearches.isOk()
    ? favoriteSearches.value.items
    : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={BuildingIcon}
        title="Propiedades"
        subtitle="La cartera de Norde: borradores, disponibles, reservadas y cerradas"
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, PROPERTY_LIST_ERROR_MESSAGES)} />
        ) : (
          <PropertiesView
            layout={layoutFrom(params)}
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            filters={filters}
            gridColumns={gridColumns}
            enabledTypes={enabledTypes}
            favoriteIds={favorites?.isOk() === true ? [...favorites.value] : []}
            favoriteSearches={searches}
            permissions={{
              create: actor.can('properties:create'),
              delete: actor.can('properties:delete') || actor.can('properties:delete-others'),
              bulkEdit: actor.can('properties:bulk-edit'),
              changeProducer: actor.can('properties:change-producer'),
              markAvailable: actor.can('properties:mark-available'),
              export: actor.can('properties:export') || actor.can('properties:export-bulk'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
