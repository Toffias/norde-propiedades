import { ListFeaturesQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { FeaturesGrid } from '../../../../features/properties/components/catalog-grids';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Servicios y ambientes' };

export default async function FeaturesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListFeaturesQuerySchema, await searchParams);
  const result = await getContainer().properties.listFeatures.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-normal text-muted-foreground">
        Los servicios, ambientes y adicionales que se marcan en la ficha de cada propiedad. Un ítem
        no se borra: se desactiva y deja de ofrecerse.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error)} />
        ) : (
          <FeaturesGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            kind={query.kind}
            state={query.state}
            canEdit={actor.can('settings:update')}
          />
        )}
      </Card>
    </div>
  );
}
