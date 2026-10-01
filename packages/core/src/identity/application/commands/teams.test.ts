import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import {
  branchSnapshot,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  seedBranch,
  seedTeam,
  seedUser,
  TEAM_ID,
  teamSnapshot,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  userSnapshot,
} from '../../testing';
import { AddTeamMember } from './add-team-member';
import { CreateTeam } from './create-team';
import { DeleteTeam } from './delete-team';
import { RemoveTeamMember } from './remove-team-member';
import { RestoreTeam } from './restore-team';
import { UpdateTeam } from './update-team';

const CAMILA = userSnapshot();

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedBranch(uow, branchSnapshot());
  seedUser(uow, CAMILA);
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    create: new CreateTeam({ uow, ids: new SequentialIdGenerator(), clock }),
    update: new UpdateTeam({ uow, clock }),
    remove: new DeleteTeam({ uow, clock }),
    restore: new RestoreTeam({ uow, clock }),
    add: new AddTeamMember({ uow, clock }),
    removeMember: new RemoveTeamMember({ uow, clock }),
  };
}

describe('CreateTeam and UpdateTeam', () => {
  it('creates a team in a branch and audits it', async () => {
    const { uow, create } = setup();

    const result = await create.execute(
      { name: 'Alquileres', branchId: MAIN_BRANCH_ID },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'team.created',
        changes: {
          name: { before: null, after: 'Alquileres' },
          branchId: { before: null, after: MAIN_BRANCH_ID },
        },
      }),
    ]);
  });

  it('rejects a missing branch, a repeated name and a missing permission', async () => {
    const { uow, create } = setup();
    seedTeam(uow, teamSnapshot());

    const branch = await create.execute(
      { name: 'Ventas', branchId: '00000000-0000-7000-8000-0000000000ff' },
      TEST_ADMIN,
    );
    const name = await create.execute({ name: 'alquileres' }, TEST_ADMIN);
    const forbidden = await create.execute({ name: 'Ventas' }, TEST_AGENT);

    expect(branch.isErr() && branch.error).toEqual({ type: 'BranchNotFound' });
    expect(name.isErr() && name.error).toEqual({ type: 'NameTaken' });
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });

  it('renames a team and audits the diff', async () => {
    const { uow, update } = setup();
    seedTeam(uow, teamSnapshot());

    await update.execute({ teamId: TEAM_ID, name: 'Alquileres norte' }, TEST_ADMIN);

    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        changes: { name: { before: 'Alquileres', after: 'Alquileres norte' } },
      }),
    ]);
  });
});

describe('team members', () => {
  it('adds and removes a member once, auditing against the team', async () => {
    const { uow, add, removeMember } = setup();
    seedTeam(uow, teamSnapshot());

    await add.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);
    await add.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);
    expect(uow.teams.members.has(`${TEAM_ID}:${CAMILA.id}`)).toBe(true);

    await removeMember.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);
    await removeMember.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);
    expect(uow.teams.members.size).toBe(0);

    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'team.member-added',
        entityType: 'team',
        entityId: TEAM_ID,
        changes: { userId: { before: null, after: CAMILA.id } },
      }),
      expect.objectContaining({
        action: 'team.member-removed',
        changes: { userId: { before: CAMILA.id, after: null } },
      }),
    ]);
  });

  it('does not change the members of a team in the trash or add a missing user', async () => {
    const { uow, add } = setup();
    seedTeam(uow, teamSnapshot({ deletedAt: TEST_NOW }));

    const trashed = await add.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);
    seedTeam(uow, teamSnapshot());
    const missing = await add.execute(
      { teamId: TEAM_ID, userId: '00000000-0000-7000-8000-00000000ffff' },
      TEST_ADMIN,
    );

    expect(trashed.isErr() && trashed.error).toEqual({ type: 'TeamDeleted' });
    expect(missing.isErr() && missing.error).toEqual({ type: 'UserNotFound' });
  });

  it('needs teams:update', async () => {
    const { uow, add } = setup();
    seedTeam(uow, teamSnapshot());

    const result = await add.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});

describe('DeleteTeam and RestoreTeam', () => {
  it('keeps the members while the team is in the trash', async () => {
    const { uow, add, remove, restore } = setup();
    seedTeam(uow, teamSnapshot());
    await add.execute({ teamId: TEAM_ID, userId: CAMILA.id }, TEST_ADMIN);

    expect((await remove.execute({ teamId: TEAM_ID }, TEST_ADMIN)).isOk()).toBe(true);
    expect((await restore.execute({ teamId: TEAM_ID }, TEST_ADMIN)).isOk()).toBe(true);

    expect(uow.teams.members.has(`${TEAM_ID}:${CAMILA.id}`)).toBe(true);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'team.member-added',
      'team.deleted',
      'team.restored',
    ]);
  });

  it('needs teams:delete', async () => {
    const { uow, remove } = setup();
    seedTeam(uow, teamSnapshot());

    const result = await remove.execute({ teamId: TEAM_ID }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
