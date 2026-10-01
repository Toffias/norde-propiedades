import {
  Branch,
  Team,
  type BranchId,
  type BranchRepository,
  type TeamId,
  type TeamRepository,
} from '@norde/core/identity';
import { Email, parseId, Phone, type Result } from '@norde/core/shared';
import { and, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { branches, teamMembers, teams, users } from '../db/schema';

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the identity tables');
  return result.value;
}

/** Mismo nombre que `name`, con la normalización de `search_text` (minúsculas, sin acentos). */
function sameName(column: typeof branches.searchText | typeof teams.searchText, name: string): SQL {
  return sql`${column} = core.search_normalize(${name.trim()})`;
}

export class DrizzleBranchRepository implements BranchRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: BranchId) {
    return this.findOneWhere(eq(branches.id, id));
  }

  findActiveByName(name: string) {
    return this.findOneWhere(and(isNull(branches.deletedAt), sameName(branches.searchText, name)));
  }

  findMain() {
    return this.findOneWhere(and(isNull(branches.deletedAt), eq(branches.isMain, true)));
  }

  async findExistingIds(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(inArray(branches.id, [...ids]), isNull(branches.deletedAt)));
    return rows.map((row) => row.id);
  }

  async countUsers(id: BranchId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(users)
      .where(eq(users.branchId, id));
    return row?.total ?? 0;
  }

  async countTeams(id: BranchId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(teams)
      .where(and(eq(teams.branchId, id), isNull(teams.deletedAt)));
    return row?.total ?? 0;
  }

  async save(branch: Branch, actorId: string): Promise<void> {
    const s = branch.toSnapshot();
    const row = {
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl ?? null,
      address: s.address ?? null,
      email: s.email?.value ?? null,
      phoneE164: s.phone?.e164 ?? null,
      whatsappE164: s.whatsapp?.e164 ?? null,
      isMain: s.isMain,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedAt === undefined ? null : actorId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      createdBy: actorId,
      updatedBy: actorId,
    };
    const { id: _id, createdAt: _createdAt, createdBy: _createdBy, ...changes } = row;
    await this.db
      .insert(branches)
      .values(row)
      .onConflictDoUpdate({ target: branches.id, set: changes });
  }

  private async findOneWhere(where: SQL | undefined): Promise<Branch | undefined> {
    const [row] = await this.db.select().from(branches).where(where).limit(1);
    if (!row) return undefined;
    return Branch.restore({
      id: stored(parseId<'Branch'>(row.id)),
      name: row.name,
      logoUrl: row.logoUrl ?? undefined,
      address: row.address ?? undefined,
      email: row.email === null ? undefined : stored(Email.create(row.email)),
      phone: row.phoneE164 === null ? undefined : stored(Phone.create(row.phoneE164)),
      whatsapp: row.whatsappE164 === null ? undefined : stored(Phone.create(row.whatsappE164)),
      isMain: row.isMain,
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: TeamId) {
    return this.findOneWhere(eq(teams.id, id));
  }

  findActiveByName(name: string) {
    return this.findOneWhere(and(isNull(teams.deletedAt), sameName(teams.searchText, name)));
  }

  async save(team: Team, actorId: string): Promise<void> {
    const s = team.toSnapshot();
    const row = {
      id: s.id,
      name: s.name,
      branchId: s.branchId ?? null,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedAt === undefined ? null : actorId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      createdBy: actorId,
      updatedBy: actorId,
    };
    const { id: _id, createdAt: _createdAt, createdBy: _createdBy, ...changes } = row;
    await this.db.insert(teams).values(row).onConflictDoUpdate({ target: teams.id, set: changes });
  }

  async isMember(teamId: TeamId, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    return row !== undefined;
  }

  async addMember(teamId: TeamId, userId: string, actorId: string, now: Date): Promise<void> {
    await this.db
      .insert(teamMembers)
      .values({ teamId, userId, createdAt: now, createdBy: actorId })
      .onConflictDoNothing();
  }

  async removeMember(teamId: TeamId, userId: string): Promise<void> {
    await this.db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  }

  private async findOneWhere(where: SQL | undefined): Promise<Team | undefined> {
    const [row] = await this.db.select().from(teams).where(where).limit(1);
    if (!row) return undefined;
    return Team.restore({
      id: stored(parseId<'Team'>(row.id)),
      name: row.name,
      branchId: row.branchId ?? undefined,
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
