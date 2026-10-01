import { ListPanelPropertiesQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { BuildingIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import { PropertiesGrid } from '../../../features/properties/components/properties-grid';
import type { PropertyFilterValues } from '../../../features/properties/components/properties-toolbar';
import { PROPERTY_LIST_ERROR_MESSAGES } from '../../../features/properties/messages';
import { messageForError } from '../../../lib/errors';
import { formatCount } from '../../../lib/format';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Propiedades' };

/** El valor de un param tal como está en la URL, para mostrarlo en los filtros. */
function raw(params: SearchParams, key: string, invalidKeys: readonly string[]): string {
  if (invalidKeys.includes(key)) return '';
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default async function PropertiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListPanelPropertiesQuerySchema, params);
  const result = await getContainer().properties.listPanelProperties.execute(query, actor);

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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={BuildingIcon}
        title="Propiedades"
        subtitle="La cartera de Norde: borradores, disponibles, reservadas y cerradas"
      />

      {result.isOk() && (
        <p className="text-sm text-muted-foreground">
          {query.view === 'trash'
            ? formatCount(
                result.value.total,
                'propiedad en la papelera',
                'propiedades en la papelera',
              )
            : formatCount(result.value.total, 'propiedad', 'propiedades')}
        </p>
      )}

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
          <PropertiesGrid
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            filters={filters}
            permissions={{
              create: actor.can('properties:create'),
              delete: actor.can('properties:delete') || actor.can('properties:delete-others'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
