import {
  AddTeamMember,
  CreateBranch,
  CreateTeam,
  CreateUser,
  DeleteBranch,
  DeleteTeam,
  MakeMainBranch,
  RemoveTeamMember,
} from '@norde/core/identity';
import { Actor } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { branches, roles, teamMembers } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { BetterAuthPasswordHasher } from './better-auth-password-hasher';
import { DrizzleOrganizationQuery } from './drizzle-organization-query';
import { DrizzleUserListQuery } from './drizzle-user-list-query';
import { createIdentityUnitOfWork } from './identity-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const now = clock.now();
const uow = createIdentityUnitOfWork(db, { ids, clock });
const ADMIN = Actor.user(ids.next(), ['users:*', 'branches:*', 'teams:*']);
const query = new DrizzleOrganizationQuery(db);
const TEMPORARY = 'temporal-12345'; // gitleaks:allow

const listBase = {
  text: undefined,
  sort: { field: 'name', direction: 'asc' },
  offset: 0,
  limit: 10,
} as const;

async function newBranch(name: string) {
  const result = await new CreateBranch({ uow, ids, clock }).execute({ name }, ADMIN);
  if (result.isErr()) throw new Error(`could not create the branch: ${result.error.type}`);
  return result.value.branchId;
}

async function newTeam(name: string, branchId?: string) {
  const result = await new CreateTeam({ uow, ids, clock }).execute(
    { name, ...(branchId === undefined ? {} : { branchId }) },
    ADMIN,
  );
  if (result.isErr()) throw new Error(`could not create the team: ${result.error.type}`);
  return result.value.teamId;
}

async function newUser(email: string, branchId?: string) {
  const roleId = ids.next();
  await db.insert(roles).values({
    id: roleId,
    key: `role-${roleId}`,
    name: `Rol ${roleId}`,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
  const result = await new CreateUser({
    uow,
    hasher: new BetterAuthPasswordHasher(),
    ids,
    clock,
  }).execute(
    {
      name: email,
      email,
      roleIds: [roleId],
      temporaryPassword: TEMPORARY,
      ...(branchId === undefined ? {} : { branchId }),
    },
    ADMIN,
  );
  if (result.isErr()) throw new Error(`could not create the user: ${result.error.type}`);
  return result.value.userId;
}

describe('branches against Postgres', () => {
  it('keeps a single main branch and counts its users', async () => {
    const central = await newBranch('Casa central');
    const belgrano = await newBranch('Belgrano');
    await newUser('camila@norde.com.ar', belgrano);

    expect(
      (await new MakeMainBranch({ uow, clock }).execute({ branchId: belgrano }, ADMIN)).isOk(),
    ).toBe(true);

    const mains = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isMain, true));
    expect(mains).toEqual([{ id: belgrano }]);
    const page = await query.searchBranches({ ...listBase, view: 'active' });
    expect(page.items.map((b) => [b.name, b.isMain, b.userCount])).toEqual([
      ['Belgrano', true, 1],
      ['Casa central', false, 0],
    ]);
    expect((await query.findBranch(central))?.isMain).toBe(false);
  });

  it('rejects a repeated name ignoring case and accents, and trashes an empty branch', async () => {
    await newBranch('Casa central');
    const nunez = await newBranch('Núñez');

    const repeated = await new CreateBranch({ uow, ids, clock }).execute({ name: 'NUNEZ' }, ADMIN);
    const deleted = await new DeleteBranch({ uow, clock }).execute({ branchId: nunez }, ADMIN);

    expect(repeated.isErr() && repeated.error).toEqual({ type: 'NameTaken' });
    expect(deleted.isOk()).toBe(true);
    expect((await query.searchBranches({ ...listBase, view: 'trash' })).items).toMatchObject([
      { name: 'Núñez' },
    ]);
    // El nombre queda libre para una sucursal nueva.
    expect(typeof (await newBranch('Núñez'))).toBe('string');
  });
});

describe('teams against Postgres', () => {
  it('adds and removes members, and lists them paged through the users query', async () => {
    const central = await newBranch('Casa central');
    const teamId = await newTeam('Alquileres', central);
    const camila = await newUser('camila@norde.com.ar', central);
    const bruno = await newUser('bruno@norde.com.ar');
    const add = new AddTeamMember({ uow, clock });
    await add.execute({ teamId, userId: camila }, ADMIN);
    await add.execute({ teamId, userId: bruno }, ADMIN);
    await add.execute({ teamId, userId: bruno }, ADMIN);

    const members = await new DrizzleUserListQuery(db).search({
      status: 'active',
      text: undefined,
      branchId: undefined,
      teamId,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    });
    expect(members.items.map((u) => [u.email, u.branch?.name])).toEqual([
      ['bruno@norde.com.ar', undefined],
      ['camila@norde.com.ar', 'Casa central'],
    ]);
    const teams = await query.searchTeams({ ...listBase, view: 'active', branchId: central });
    expect(teams.items).toMatchObject([
      { name: 'Alquileres', memberCount: 2, branch: { id: central, name: 'Casa central' } },
    ]);

    await new RemoveTeamMember({ uow, clock }).execute({ teamId, userId: bruno }, ADMIN);
    expect(
      await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId)),
    ).toEqual([{ userId: camila }]);
  });

  it('keeps a branch with teams out of the trash until the team goes', async () => {
    await newBranch('Casa central');
    const belgrano = await newBranch('Belgrano');
    const teamId = await newTeam('Ventas', belgrano);
    const remove = new DeleteBranch({ uow, clock });

    const withTeam = await remove.execute({ branchId: belgrano }, ADMIN);
    await new DeleteTeam({ uow, clock }).execute({ teamId }, ADMIN);
    const empty = await remove.execute({ branchId: belgrano }, ADMIN);

    expect(withTeam.isErr() && withTeam.error).toEqual({ type: 'BranchHasTeams', teamCount: 1 });
    expect(empty.isOk()).toBe(true);
    expect(
      (await query.searchTeams({ ...listBase, view: 'trash', branchId: undefined })).total,
    ).toBe(1);
  });
});
