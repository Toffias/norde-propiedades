import { SearchTagsQuerySchema } from '@norde/core/properties/contracts';
import { MAX_PAGE_SIZE } from '@norde/core/shared/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { TagsGrid } from '../../../../features/properties/components/catalog-grids';
import { TagsTabs } from '../../../../features/properties/components/tags-tabs';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Etiquetas de propiedades' };

export default async function PropertyTagsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(SearchTagsQuerySchema, await searchParams);
  const { properties } = getContainer();
  const [result, groups] = await Promise.all([
    properties.searchTags.execute(query, actor),
    // El filtro por grupo ofrece una página de grupos, ordenados por nombre: son pocos.
    properties.listTagGroups.execute({ page: 1, pageSize: MAX_PAGE_SIZE, sort: 'name' }, actor),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-normal text-muted-foreground">
        Etiquetas que se asignan a las propiedades, sueltas o en grupos. Se usan como atributo y
        como filtro. Una etiqueta en uso no se borra.
      </p>
      <TagsTabs active="tags" />
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error)} />
        ) : (
          <TagsGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            group={query.group}
            groups={groups.isOk() ? groups.value.items : []}
            canEdit={actor.can('tags:update')}
          />
        )}
      </Card>
    </div>
  );
}
