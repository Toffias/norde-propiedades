import { SearchLocationsQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { LocationsGrid } from '../../../../features/properties/components/catalog-grids';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Ubicaciones' };

export default async function LocationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(SearchLocationsQuerySchema, await searchParams);
  const result = await getContainer().properties.searchLocations.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-normal text-muted-foreground">
        El catálogo del buscador de ubicaciones del alta: país, provincia, localidad, barrio y
        subbarrio. Si falta un barrio, sumalo dentro de su localidad.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error)} />
        ) : (
          <LocationsGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            kind={query.kind}
            canEdit={actor.can('settings:update')}
          />
        )}
      </Card>
    </div>
  );
}
