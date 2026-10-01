import type {
  BranchDetail,
  BranchListCriteria,
  BranchListItem,
  OrganizationQuery,
  TeamDetail,
  TeamListCriteria,
  TeamListItem,
} from '@norde/core/identity';
import { and, asc, count, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { branches, teamMembers, teams, users } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

function view(column: typeof branches.deletedAt | typeof teams.deletedAt, trash: boolean): SQL {
  return trash ? isNotNull(column) : isNull(column);
}

export class DrizzleOrganizationQuery implements OrganizationQuery {
  constructor(private readonly db: DbExecutor) {}

  async searchBranches(criteria: BranchListCriteria) {
    const where = and(
      view(branches.deletedAt, criteria.view === 'trash'),
      criteria.text === undefined
        ? undefined
        : matchesSearchText(branches.searchText, criteria.text),
    );
    const ascending = criteria.sort.direction === 'asc';
    // Usuarios por sucursal, por el índice `users_branch_idx`.
    const userCount = this.db
      .select({ branchId: users.branchId, total: count().as('total') })
      .from(users)
      .groupBy(users.branchId)
      .as('user_count');

    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: branches.id,
          name: branches.name,
          address: branches.address,
          isMain: branches.isMain,
          deletedAt: branches.deletedAt,
          userCount: sql<number>`coalesce(${userCount.total}, 0)`.mapWith(Number),
        })
        .from(branches)
        .leftJoin(userCount, eq(userCount.branchId, branches.id))
        .where(where)
        .orderBy(
          ascending ? asc(branches.name) : desc(branches.name),
          ascending ? asc(branches.id) : desc(branches.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(branches).where(where),
    ]);

    const items: BranchListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address ?? undefined,
      isMain: row.isMain,
      userCount: row.userCount,
      deletedAt: row.deletedAt ?? undefined,
    }));
    return { items, total: totals[0]?.total ?? 0 };
  }

  async findBranch(id: string): Promise<BranchDetail | undefined> {
    const [row] = await this.db.select().from(branches).where(eq(branches.id, id)).limit(1);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl ?? undefined,
      address: row.address ?? undefined,
      email: row.email ?? undefined,
      phone: row.phoneE164 ?? undefined,
      whatsapp: row.whatsappE164 ?? undefined,
      isMain: row.isMain,
      deletedAt: row.deletedAt ?? undefined,
    };
  }

  async searchTeams(criteria: TeamListCriteria) {
    const where = and(
      view(teams.deletedAt, criteria.view === 'trash'),
      criteria.text === undefined ? undefined : matchesSearchText(teams.searchText, criteria.text),
      criteria.branchId === undefined ? undefined : eq(teams.branchId, criteria.branchId),
    );
    const ascending = criteria.sort.direction === 'asc';
    const memberCount = this.db
      .select({ teamId: teamMembers.teamId, total: count().as('total') })
      .from(teamMembers)
      .groupBy(teamMembers.teamId)
      .as('member_count');

    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: teams.id,
          name: teams.name,
          deletedAt: teams.deletedAt,
          branchId: branches.id,
          branchName: branches.name,
          memberCount: sql<number>`coalesce(${memberCount.total}, 0)`.mapWith(Number),
        })
        .from(teams)
        .leftJoin(branches, eq(branches.id, teams.branchId))
        .leftJoin(memberCount, eq(memberCount.teamId, teams.id))
        .where(where)
        .orderBy(
          ascending ? asc(teams.name) : desc(teams.name),
          ascending ? asc(teams.id) : desc(teams.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(teams).where(where),
    ]);

    const items: TeamListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      branch:
        row.branchId === null || row.branchName === null
          ? undefined
          : { id: row.branchId, name: row.branchName },
      memberCount: row.memberCount,
      deletedAt: row.deletedAt ?? undefined,
    }));
    return { items, total: totals[0]?.total ?? 0 };
  }

  async findTeam(id: string): Promise<TeamDetail | undefined> {
    const [row] = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        deletedAt: teams.deletedAt,
        branchId: branches.id,
        branchName: branches.name,
      })
      .from(teams)
      .leftJoin(branches, eq(branches.id, teams.branchId))
      .where(eq(teams.id, id))
      .limit(1);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      branch:
        row.branchId === null || row.branchName === null
          ? undefined
          : { id: row.branchId, name: row.branchName },
      deletedAt: row.deletedAt ?? undefined,
    };
  }
}
