import { ListTeamsQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { companyFeatures } from '../../../../config/env';
import { getContainer } from '../../../../container';
import type { TeamSheetData } from '../../../../features/identity/components/team-sheet';
import { TeamsGrid } from '../../../../features/identity/components/teams-grid';
import { TEAM_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { loadPanelUsers } from '../../../../features/identity/panel-users';
import { teamTab } from '../../../../features/identity/panels';
import type { Actor } from '@norde/core/shared';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import {
  parsePanelPage,
  parsePanelParams,
  type PanelData,
  type PanelState,
} from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Equipos' };

export default async function TeamsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  if (!companyFeatures().teams) notFound();
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListTeamsQuerySchema, params);
  const [teams, detail] = await Promise.all([
    getContainer().identity.listTeams.execute(query, actor),
    loadTeamPanel(parsePanelParams(params), parsePanelPage(params), actor),
  ]);

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
          detail={detail}
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

/** El equipo del panel de edición y, en la pestaña "Miembros", una página de sus miembros. */
async function loadTeamPanel(
  panel: PanelState | undefined,
  page: number,
  actor: Actor,
): Promise<PanelData<TeamSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const { identity } = getContainer();
  const team = await identity.getTeam.execute({ teamId: panel.id }, actor);
  if (team.isErr()) {
    return { id: panel.id, ok: false, message: messageForError(team.error, TEAM_ERROR_MESSAGES) };
  }
  if (team.value.deletedAt !== undefined) {
    return { id: panel.id, ok: false, message: TEAM_ERROR_MESSAGES.TeamDeleted };
  }
  return {
    id: panel.id,
    ok: true,
    value: {
      team: team.value,
      members:
        teamTab(panel.tab) === 'members'
          ? await loadPanelUsers(panel.id, { teamId: panel.id }, page, actor)
          : undefined,
    },
  };
}
