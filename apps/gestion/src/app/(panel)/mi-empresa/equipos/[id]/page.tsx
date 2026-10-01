import { ListUsersQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../../../container';
import { TeamMembersGrid } from '../../../../../features/identity/components/team-members-grid';
import { TEAM_ERROR_MESSAGES } from '../../../../../features/identity/messages';
import { messageForError } from '../../../../../lib/errors';
import { formatCount } from '../../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Equipo' };

export default async function TeamPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { id } = await params;
  const { identity } = getContainer();
  const team = await identity.getTeam.execute({ teamId: id }, actor);
  if (team.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(team.error, TEAM_ERROR_MESSAGES)} />
      </Card>
    );
  }

  // Los miembros son el listado de usuarios con el equipo como filtro: paginado en el servidor.
  const { value: query } = parseListParams(ListUsersQuerySchema, {
    ...(await searchParams),
    teamId: id,
  });
  const members = await identity.listUsers.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{team.value.name}</h2>
        <p className="text-sm text-muted-foreground">
          {team.value.branch === undefined ? 'Sin sucursal' : `Sucursal ${team.value.branch.name}`}
          {members.isOk() && ` · ${formatCount(members.value.total, 'miembro', 'miembros')}`} ·{' '}
          <Link href="/mi-empresa/equipos" className="underline underline-offset-2">
            Volver a equipos
          </Link>
        </p>
      </div>
      <Card className="gap-0 overflow-hidden p-0">
        {members.isErr() ? (
          <DataTableError message={messageForError(members.error)} />
        ) : team.value.deletedAt !== undefined ? (
          <DataTableError message={TEAM_ERROR_MESSAGES.TeamDeleted} />
        ) : (
          <TeamMembersGrid
            teamId={team.value.id}
            canEdit={actor.can('teams:update')}
            rows={members.value.items}
            total={members.value.total}
            page={members.value.page}
            pageSize={members.value.pageSize}
            sort={query.sort}
          />
        )}
      </Card>
    </div>
  );
}
