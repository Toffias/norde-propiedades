// Fakes del módulo identity para tests (`@norde/core/identity/testing`).

import type { Email, PageSlice } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  CredentialStore,
  IdentityTransaction,
  IdentityUnitOfWork,
  UserSessions,
} from '../application/ports/identity-transaction';
import type {
  BranchListCriteria,
  OrganizationQuery,
  TeamListCriteria,
} from '../application/ports/organization-query';
import type { PasswordHasher } from '../application/ports/password-hasher';
import type { RoleListCriteria, RoleListQuery } from '../application/ports/role-list-query';
import type { UserAccessQuery, UserAccessRecord } from '../application/ports/user-access-query';
import type { UserListCriteria, UserListQuery } from '../application/ports/user-list-query';
import type {
  BranchDetail,
  BranchListItem,
  RoleDetail,
  RoleListItem,
  TeamDetail,
  TeamListItem,
  UserListItem,
} from '../contracts';
import { Branch, type BranchId, type BranchSnapshot } from '../domain/branch';
import type { BranchRepository, TeamRepository } from '../domain/organization.repository';
import { Role, type RoleId, type RoleSnapshot } from '../domain/role';
import type { RoleRepository } from '../domain/role.repository';
import { Team, type TeamId, type TeamSnapshot } from '../domain/team';
import { User, type UserId, type UserSnapshot } from '../domain/user';
import type { UserRepository } from '../domain/user.repository';

import { roleSnapshot } from './fixtures';

export * from './fixtures';

export class InMemoryUserAccessQuery implements UserAccessQuery {
  readonly rows = new Map<string, UserAccessRecord>();

  constructor(users: readonly UserAccessRecord[] = []) {
    for (const user of users) this.rows.set(user.id, user);
  }

  findByUserId(userId: string) {
    return Promise.resolve(this.rows.get(userId));
  }
}

/** Guarda snapshots (no instancias), igual que una base: cada lectura devuelve un aggregate nuevo. */
export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, UserSnapshot>();
  /** Quién hizo el último cambio de cada usuario (`updated_by`). */
  readonly updatedBy = new Map<string, string>();

  findById(id: UserId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && User.restore(row));
  }

  findByEmail(email: Email) {
    const row = [...this.rows.values()].find((r) => r.email.equals(email));
    return Promise.resolve(row && User.restore(row));
  }

  save(user: User, actorId: string) {
    this.rows.set(user.id, user.toSnapshot());
    this.updatedBy.set(user.id, actorId);
    return Promise.resolve();
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  readonly rows = new Map<string, RoleSnapshot>();
  readonly updatedBy = new Map<string, string>();

  /** Para contar los usuarios de cada rol. */
  constructor(private readonly users: InMemoryUserRepository) {}

  findById(id: RoleId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Role.restore(row));
  }

  findByKey(key: string) {
    const row = [...this.rows.values()].find((r) => r.key === key);
    return Promise.resolve(row && Role.restore(row));
  }

  findByName(name: string) {
    // Como `core.search_normalize`: minúsculas y sin acentos.
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
    const row = [...this.rows.values()].find((r) => normalize(r.name) === normalize(name));
    return Promise.resolve(row && Role.restore(row));
  }

  findExistingIds(ids: readonly string[]) {
    return Promise.resolve(
      ids.filter((id) => {
        const row = this.rows.get(id);
        return row !== undefined && row.deletedAt === undefined;
      }),
    );
  }

  countUsers(id: RoleId) {
    return Promise.resolve(
      [...this.users.rows.values()].filter((user) => user.roleIds.includes(id)).length,
    );
  }

  save(role: Role, actorId: string) {
    this.rows.set(role.id, role.toSnapshot());
    this.updatedBy.set(role.id, actorId);
    return Promise.resolve();
  }
}

// Como `core.search_normalize`: minúsculas y sin acentos.
function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export class InMemoryBranchRepository implements BranchRepository {
  readonly rows = new Map<string, BranchSnapshot>();
  readonly updatedBy = new Map<string, string>();

  constructor(
    private readonly users: InMemoryUserRepository,
    private readonly teams: InMemoryTeamRepository,
  ) {}

  findById(id: BranchId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Branch.restore(row));
  }

  findActiveByName(name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.deletedAt === undefined && normalizeName(r.name) === normalizeName(name),
    );
    return Promise.resolve(row && Branch.restore(row));
  }

  findMain() {
    const row = [...this.rows.values()].find((r) => r.isMain && r.deletedAt === undefined);
    return Promise.resolve(row && Branch.restore(row));
  }

  findExistingIds(ids: readonly string[]) {
    return Promise.resolve(
      ids.filter((id) => {
        const row = this.rows.get(id);
        return row !== undefined && row.deletedAt === undefined;
      }),
    );
  }

  countUsers(id: BranchId) {
    return Promise.resolve([...this.users.rows.values()].filter((u) => u.branchId === id).length);
  }

  countTeams(id: BranchId) {
    return Promise.resolve(
      [...this.teams.rows.values()].filter((t) => t.branchId === id && t.deletedAt === undefined)
        .length,
    );
  }

  save(branch: Branch, actorId: string) {
    this.rows.set(branch.id, branch.toSnapshot());
    this.updatedBy.set(branch.id, actorId);
    return Promise.resolve();
  }
}

export class InMemoryTeamRepository implements TeamRepository {
  readonly rows = new Map<string, TeamSnapshot>();
  /** `teamId:userId` de cada miembro. */
  readonly members = new Set<string>();

  findById(id: TeamId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Team.restore(row));
  }

  findActiveByName(name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.deletedAt === undefined && normalizeName(r.name) === normalizeName(name),
    );
    return Promise.resolve(row && Team.restore(row));
  }

  save(team: Team) {
    this.rows.set(team.id, team.toSnapshot());
    return Promise.resolve();
  }

  isMember(teamId: TeamId, userId: string) {
    return Promise.resolve(this.members.has(`${teamId}:${userId}`));
  }

  addMember(teamId: TeamId, userId: string) {
    this.members.add(`${teamId}:${userId}`);
    return Promise.resolve();
  }

  removeMember(teamId: TeamId, userId: string) {
    this.members.delete(`${teamId}:${userId}`);
    return Promise.resolve();
  }
}

export class InMemoryCredentialStore implements CredentialStore {
  readonly hashes = new Map<string, string>();

  findPasswordHash(userId: string) {
    return Promise.resolve(this.hashes.get(userId));
  }

  setPasswordHash(userId: string, hash: string) {
    this.hashes.set(userId, hash);
    return Promise.resolve();
  }
}

export class InMemoryUserSessions implements UserSessions {
  /** Cantidad de sesiones abiertas por usuario. */
  readonly open = new Map<string, number>();

  revokeAll(userId: string) {
    this.open.delete(userId);
    return Promise.resolve();
  }
}

/** "Hash" reversible para tests: alcanza para verificar que se guarda el hash y no la contraseña. */
export class FakePasswordHasher implements PasswordHasher {
  hash(password: string) {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(hash: string, password: string) {
    return Promise.resolve(hash === `hashed:${password}`);
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryIdentityUnitOfWork implements IdentityUnitOfWork {
  readonly users = new InMemoryUserRepository();
  readonly roles = new InMemoryRoleRepository(this.users);
  readonly teams = new InMemoryTeamRepository();
  readonly branches = new InMemoryBranchRepository(this.users, this.teams);
  readonly credentials = new InMemoryCredentialStore();
  readonly sessions = new InMemoryUserSessions();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: IdentityTransaction) => Promise<T>): Promise<T> {
    const backup = {
      users: new Map(this.users.rows),
      roles: new Map(this.roles.rows),
      branches: new Map(this.branches.rows),
      teams: new Map(this.teams.rows),
      members: new Set(this.teams.members),
      hashes: new Map(this.credentials.hashes),
      sessions: new Map(this.sessions.open),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      restore(this.users.rows, backup.users);
      restore(this.roles.rows, backup.roles);
      restore(this.branches.rows, backup.branches);
      restore(this.teams.rows, backup.teams);
      this.teams.members.clear();
      for (const member of backup.members) this.teams.members.add(member);
      restore(this.credentials.hashes, backup.hashes);
      restore(this.sessions.open, backup.sessions);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };

    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

/**
 * Siembra un usuario ya guardado (sin eventos), con su contraseña y sus sesiones abiertas. Los
 * roles que usa quedan registrados como existentes.
 */
export function seedUser(
  uow: InMemoryIdentityUnitOfWork,
  user: UserSnapshot,
  options: { readonly password?: string; readonly openSessions?: number } = {},
): void {
  uow.users.rows.set(user.id, user);
  for (const roleId of user.roleIds) {
    if (!uow.roles.rows.has(roleId)) seedRole(uow, roleSnapshot({ id: roleId, key: roleId }));
  }
  if (options.password !== undefined) {
    uow.credentials.hashes.set(user.id, `hashed:${options.password}`);
  }
  if (options.openSessions !== undefined) uow.sessions.open.set(user.id, options.openSessions);
}

export function seedBranch(uow: InMemoryIdentityUnitOfWork, branch: BranchSnapshot): void {
  uow.branches.rows.set(branch.id, branch);
}

export function seedTeam(uow: InMemoryIdentityUnitOfWork, team: TeamSnapshot): void {
  uow.teams.rows.set(team.id, team);
}

/** Siembra un rol ya guardado (sin eventos). */
export function seedRole(uow: InMemoryIdentityUnitOfWork, role: RoleSnapshot): void {
  uow.roles.rows.set(role.id, role);
}

function restore<K, V>(target: Map<K, V>, backup: ReadonlyMap<K, V>): void {
  target.clear();
  for (const [key, value] of backup) target.set(key, value);
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

/** Devuelve las filas dadas y registra con qué criterio se la llamó. */
export class StubUserListQuery implements UserListQuery {
  readonly calls: UserListCriteria[] = [];

  constructor(private readonly slice: PageSlice<UserListItem> = { items: [], total: 0 }) {}

  search(criteria: UserListCriteria) {
    this.calls.push(criteria);
    return Promise.resolve(this.slice);
  }
}

export class StubRoleListQuery implements RoleListQuery {
  readonly calls: RoleListCriteria[] = [];

  constructor(
    private readonly slice: PageSlice<RoleListItem> = { items: [], total: 0 },
    private readonly details: readonly RoleDetail[] = [],
  ) {}

  search(criteria: RoleListCriteria) {
    this.calls.push(criteria);
    return Promise.resolve(this.slice);
  }

  findById(id: string) {
    return Promise.resolve(this.details.find((role) => role.id === id));
  }
}

export class StubOrganizationQuery implements OrganizationQuery {
  readonly branchCalls: BranchListCriteria[] = [];
  readonly teamCalls: TeamListCriteria[] = [];

  constructor(
    private readonly data: {
      readonly branches?: PageSlice<BranchListItem>;
      readonly teams?: PageSlice<TeamListItem>;
      readonly branchDetails?: readonly BranchDetail[];
      readonly teamDetails?: readonly TeamDetail[];
    } = {},
  ) {}

  searchBranches(criteria: BranchListCriteria) {
    this.branchCalls.push(criteria);
    return Promise.resolve(this.data.branches ?? { items: [], total: 0 });
  }

  findBranch(id: string) {
    return Promise.resolve(this.data.branchDetails?.find((b) => b.id === id));
  }

  searchTeams(criteria: TeamListCriteria) {
    this.teamCalls.push(criteria);
    return Promise.resolve(this.data.teams ?? { items: [], total: 0 });
  }

  findTeam(id: string) {
    return Promise.resolve(this.data.teamDetails?.find((t) => t.id === id));
  }
}
