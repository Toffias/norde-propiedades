import { ListClientTagGroupsQuerySchema } from '@norde/core/clients/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../../container';
import { ClientTagGroupsGrid } from '../../../../../features/clients/components/client-tag-catalog';
import { ClientTagsHeader } from '../../../../../features/clients/components/client-tags-header';
import { CLIENT_TAG_GROUPS_ERROR_MESSAGES } from '../../../../../features/clients/messages';
import { messageForError } from '../../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Grupos de etiquetas de contactos' };

export default async function ClientTagGroupsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListClientTagGroupsQuerySchema, await searchParams);
  const result = await getContainer().clients.listClientTagGroups.execute(query, actor);

  return (
    <div className="flex flex-col gap-5">
      <ClientTagsHeader active="groups" />
      <p className="text-sm leading-normal text-muted-foreground">
        Los grupos ordenan las etiquetas (por ejemplo, Origen, Alquileres o Colegas). Un grupo con
        etiquetas no se borra.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError
            message={messageForError(result.error, CLIENT_TAG_GROUPS_ERROR_MESSAGES)}
          />
        ) : (
          <ClientTagGroupsGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            canEdit={actor.can('tags:update')}
          />
        )}
      </Card>
    </div>
  );
}
