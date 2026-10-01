import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import {
  branchSnapshot,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  seedBranch,
  seedTeam,
  seedUser,
  teamSnapshot,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  userSnapshot,
} from '../../testing';
import { CreateBranch } from './create-branch';
import { DeleteBranch } from './delete-branch';
import { MakeMainBranch } from './make-main-branch';
import { RestoreBranch } from './restore-branch';
import { UpdateBranch } from './update-branch';

const OTHER_ID = '00000000-0000-7000-8000-0000000000b2';

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    create: new CreateBranch({ uow, ids: new SequentialIdGenerator(), clock }),
    update: new UpdateBranch({ uow, clock }),
    makeMain: new MakeMainBranch({ uow, clock }),
    remove: new DeleteBranch({ uow, clock }),
    restore: new RestoreBranch({ uow, clock }),
  };
}

describe('CreateBranch', () => {
  it('makes the first branch the main one and audits its contact data', async () => {
    const { uow, create } = setup();

    const result = await create.execute(
      {
        name: 'Casa central',
        address: 'Av. Cabildo 1234',
        email: 'Hola@Norde.com.ar',
        whatsapp: '+54 9 11 6689-9124',
      },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(uow.branches.rows.get(result.value.branchId)?.isMain).toBe(true);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'branch.created',
        entityType: 'branch',
        changes: {
          name: { before: null, after: 'Casa central' },
          address: { before: null, after: 'Av. Cabildo 1234' },
          email: { before: null, after: 'hola@norde.com.ar' },
          whatsapp: { before: null, after: '+5491166899124' },
          isMain: { before: null, after: true },
        },
      }),
    ]);
  });

  it('does not make the next ones main, nor repeat a name', async () => {
    const { uow, create } = setup();
    seedBranch(uow, branchSnapshot());

    const second = await create.execute({ name: 'Belgrano' }, TEST_ADMIN);
    const repeated = await create.execute({ name: 'CASA CENTRAL' }, TEST_ADMIN);

    expect(second.isOk() && uow.branches.rows.get(second.value.branchId)?.isMain).toBe(false);
    expect(repeated.isErr() && repeated.error).toEqual({ type: 'NameTaken' });
  });

  it('rejects an invalid phone and needs branches:create', async () => {
    const { create } = setup();

    const phone = await create.execute({ name: 'Belgrano', phone: '123' }, TEST_ADMIN);
    const forbidden = await create.execute({ name: 'Belgrano' }, TEST_AGENT);

    expect(phone.isErr() && phone.error).toEqual({ type: 'InvalidPhone' });
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});

describe('UpdateBranch', () => {
  it('audits only what changed', async () => {
    const { uow, update } = setup();
    seedBranch(uow, branchSnapshot());

    await update.execute(
      { branchId: MAIN_BRANCH_ID, name: 'Casa central', address: 'Av. Cabildo 1500, CABA' },
      TEST_ADMIN,
    );

    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        changes: {
          address: { before: 'Av. Cabildo 1234, CABA', after: 'Av. Cabildo 1500, CABA' },
        },
      }),
    ]);
  });

  it('fails for a missing branch and needs branches:update', async () => {
    const { uow, update } = setup();
    seedBranch(uow, branchSnapshot());

    const missing = await update.execute({ branchId: OTHER_ID, name: 'X' }, TEST_ADMIN);
    const forbidden = await update.execute({ branchId: MAIN_BRANCH_ID, name: 'X' }, TEST_AGENT);

    expect(missing.isErr() && missing.error).toEqual({ type: 'BranchNotFound' });
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});

describe('MakeMainBranch', () => {
  it('moves the main mark from the old branch to the new one', async () => {
    const { uow, makeMain } = setup();
    seedBranch(uow, branchSnapshot());
    seedBranch(uow, branchSnapshot({ id: OTHER_ID, name: 'Belgrano', isMain: false }));

    const result = await makeMain.execute({ branchId: OTHER_ID }, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    expect(uow.branches.rows.get(MAIN_BRANCH_ID)?.isMain).toBe(false);
    expect(uow.branches.rows.get(OTHER_ID)?.isMain).toBe(true);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'branch.made-main',
        entityId: OTHER_ID,
        changes: { previousMainId: { before: MAIN_BRANCH_ID, after: null } },
      }),
    ]);
  });
});

describe('DeleteBranch and RestoreBranch', () => {
  it('sends an empty branch to the trash and brings it back', async () => {
    const { uow, remove, restore } = setup();
    seedBranch(uow, branchSnapshot({ id: OTHER_ID, name: 'Belgrano', isMain: false }));

    expect((await remove.execute({ branchId: OTHER_ID }, TEST_ADMIN)).isOk()).toBe(true);
    expect(uow.branches.rows.get(OTHER_ID)?.deletedAt).toEqual(TEST_NOW);
    expect((await restore.execute({ branchId: OTHER_ID }, TEST_ADMIN)).isOk()).toBe(true);
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['branch.deleted', 'branch.restored']);
  });

  it('does not delete the main branch or one with users or teams', async () => {
    const { uow, remove } = setup();
    seedBranch(uow, branchSnapshot());
    seedBranch(uow, branchSnapshot({ id: OTHER_ID, name: 'Belgrano', isMain: false }));
    seedUser(uow, userSnapshot({ branchId: OTHER_ID }));

    const main = await remove.execute({ branchId: MAIN_BRANCH_ID }, TEST_ADMIN);
    const withUser = await remove.execute({ branchId: OTHER_ID }, TEST_ADMIN);
    uow.users.rows.clear();
    seedTeam(uow, teamSnapshot({ branchId: OTHER_ID }));
    const withTeam = await remove.execute({ branchId: OTHER_ID }, TEST_ADMIN);

    expect(main.isErr() && main.error).toEqual({ type: 'MainBranchCannotBeDeleted' });
    expect(withUser.isErr() && withUser.error).toEqual({ type: 'BranchHasMembers', userCount: 1 });
    expect(withTeam.isErr() && withTeam.error).toEqual({ type: 'BranchHasTeams', teamCount: 1 });
  });

  it('does not restore a branch whose name is taken again', async () => {
    const { uow, restore } = setup();
    seedBranch(uow, branchSnapshot());
    seedBranch(
      uow,
      branchSnapshot({ id: OTHER_ID, name: 'Casa Central', isMain: false, deletedAt: TEST_NOW }),
    );

    const result = await restore.execute({ branchId: OTHER_ID }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'NameTaken' });
  });

  it('needs branches:delete for both', async () => {
    const { uow, remove, restore } = setup();
    seedBranch(uow, branchSnapshot({ id: OTHER_ID, name: 'Belgrano', isMain: false }));

    const removed = await remove.execute({ branchId: OTHER_ID }, TEST_AGENT);
    const restored = await restore.execute({ branchId: OTHER_ID }, TEST_AGENT);

    expect(removed.isErr() && removed.error).toEqual({ type: 'Forbidden' });
    expect(restored.isErr() && restored.error).toEqual({ type: 'Forbidden' });
  });
});
