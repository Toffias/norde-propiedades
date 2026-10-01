import { ListTeamsQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { TeamsGrid } from '../../../../features/identity/components/teams-grid';
import { TEAM_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Equipos' };

export default async function TeamsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(ListTeamsQuerySchema, await searchParams);
  const teams = await getContainer().identity.listTeams.execute(query, actor);

  if (teams.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(teams.error, TEAM_ERROR_MESSAGES)} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {query.view === 'trash'
          ? formatCount(teams.value.total, 'equipo en la papelera', 'equipos en la papelera')
          : formatCount(teams.value.total, 'equipo', 'equipos')}
      </p>

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <TeamsGrid
          rows={teams.value.items}
          total={teams.value.total}
          page={teams.value.page}
          pageSize={teams.value.pageSize}
          sort={query.sort}
          view={query.view}
          text={query.q ?? ''}
          permissions={{
            create: actor.can('teams:create'),
            update: actor.can('teams:update'),
            delete: actor.can('teams:delete'),
          }}
        />
      </Card>
    </div>
  );
}
