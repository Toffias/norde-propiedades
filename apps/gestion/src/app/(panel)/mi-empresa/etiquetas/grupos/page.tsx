import { ListTagGroupsQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../../container';
import { TagGroupsGrid } from '../../../../../features/properties/components/catalog-grids';
import { TagsTabs } from '../../../../../features/properties/components/tags-tabs';
import { messageForError } from '../../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Grupos de etiquetas' };

export default async function PropertyTagGroupsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListTagGroupsQuerySchema, await searchParams);
  const result = await getContainer().properties.listTagGroups.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-normal text-muted-foreground">
        Los grupos ordenan las etiquetas (por ejemplo, Documentación o Campañas). Un grupo con
        etiquetas no se borra.
      </p>
      <TagsTabs active="groups" />
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error)} />
        ) : (
          <TagGroupsGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            canEdit={actor.can('tags:update')}
          />
        )}
      </Card>
    </div>
  );
}
