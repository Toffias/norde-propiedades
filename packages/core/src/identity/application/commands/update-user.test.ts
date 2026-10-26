import { describe, expect, it } from 'vitest';

import { Actor, Email } from '../../../shared';
import { FixedClock } from '../../../shared/testing';
import type { UpdateUserInput } from '../../contracts';
import {
  branchSnapshot,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  ROLE_AGENT_ID,
  ROLE_MANAGER_ID,
  roleSnapshot,
  seedBranch,
  seedRole,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  testUserId,
  userSnapshot,
} from '../../testing';
import { UpdateUser } from './update-user';

const CAMILA = userSnapshot();
const OTHER_BRANCH_ID = '00000000-0000-7000-8000-0000000000b2';

function emailOf(raw: string) {
  const email = Email.create(raw);
  if (email.isErr()) throw new Error('invalid test email');
  return email.value;
}

const UNCHANGED: UpdateUserInput = {
  userId: CAMILA.id,
  name: 'Camila Pérez',
  email: 'camila@norde.com.ar',
  phone: '+5491166899124',
  branchId: MAIN_BRANCH_ID,
  roleIds: [ROLE_AGENT_ID],
};

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA);
  seedBranch(uow, branchSnapshot());
  seedBranch(uow, branchSnapshot({ id: OTHER_BRANCH_ID, name: 'Belgrano', isMain: false }));
  seedRole(uow, roleSnapshot({ id: ROLE_MANAGER_ID, key: 'manager' }));
  const useCase = new UpdateUser({ uow, clock: new FixedClock(TEST_NOW) });
  return { uow, useCase };
}

describe('UpdateUser', () => {
  it('does not let a user give themselves another role', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { ...UNCHANGED, roleIds: [ROLE_AGENT_ID, ROLE_MANAGER_ID] },
      Actor.user(CAMILA.id, ['users:update']),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'CannotChangeOwnRoles' });
    expect(uow.users.rows.get(CAMILA.id)?.roleIds).toEqual([ROLE_AGENT_ID]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('lets a user edit their own data while keeping their roles', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { ...UNCHANGED, name: 'Camila Pérez Ruiz' },
      Actor.user(CAMILA.id, ['users:update']),
    );

    expect(result.isOk()).toBe(true);
    expect(uow.users.rows.get(CAMILA.id)?.name).toBe('Camila Pérez Ruiz');
  });

  it('saves the changes and audits only the fields that changed', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { ...UNCHANGED, name: 'Camila Pérez Ruiz', roleIds: [ROLE_MANAGER_ID] },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.users.rows.get(CAMILA.id)).toMatchObject({
      name: 'Camila Pérez Ruiz',
      roleIds: [ROLE_MANAGER_ID],
      updatedAt: TEST_NOW,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.user_roles_changed']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'user.updated',
        entityId: CAMILA.id,
        changes: {
          name: { before: 'Camila Pérez', after: 'Camila Pérez Ruiz' },
          roleIds: { before: [ROLE_AGENT_ID], after: [ROLE_MANAGER_ID] },
        },
      }),
    ]);
  });

  it('does not save or audit anything when nothing changed', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(UNCHANGED, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    expect(uow.users.updatedBy.size).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('removes the phone when it comes empty', async () => {
    const { uow, useCase } = setup();
    const { phone: _phone, ...withoutPhone } = UNCHANGED;

    await useCase.execute(withoutPhone, TEST_ADMIN);

    expect(uow.users.rows.get(CAMILA.id)?.phone).toBeUndefined();
    expect(uow.audit.entries[0]?.changes).toEqual({
      phone: { before: '+5491166899124', after: null },
    });
  });

  it('rejects the email of another user', async () => {
    const { uow, useCase } = setup();
    const lucia = userSnapshot({ id: testUserId(TEST_AGENT.id) });
    seedUser(uow, { ...lucia, email: emailOf('lucia@norde.com.ar') });

    const result = await useCase.execute({ ...UNCHANGED, email: 'Lucia@norde.com.ar' }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'EmailTaken' });
    expect(uow.users.rows.get(CAMILA.id)?.email.value).toBe('camila@norde.com.ar');
  });

  it('fails for a user or a role that does not exist', async () => {
    const { useCase } = setup();

    const missingUser = await useCase.execute(
      { ...UNCHANGED, userId: '00000000-0000-7000-8000-00000000ffff' },
      TEST_ADMIN,
    );
    expect(missingUser.isErr() && missingUser.error).toEqual({ type: 'UserNotFound' });

    const missingRole = await useCase.execute(
      { ...UNCHANGED, roleIds: ['00000000-0000-7000-8000-00000000ffff'] },
      TEST_ADMIN,
    );
    expect(missingRole.isErr() && missingRole.error).toEqual({ type: 'RoleNotFound' });
  });

  it('moves the user to another branch, which is required and has to exist', async () => {
    const { uow, useCase } = setup();
    const { branchId: _branchId, ...withoutBranch } = UNCHANGED;

    const moved = await useCase.execute({ ...UNCHANGED, branchId: OTHER_BRANCH_ID }, TEST_ADMIN);
    const missing = await useCase.execute(
      { ...UNCHANGED, branchId: '00000000-0000-7000-8000-0000000000ff' },
      TEST_ADMIN,
    );
    // @ts-expect-error -- llega sin sucursal desde un cliente que no usa el contract.
    const none = await useCase.execute(withoutBranch, TEST_ADMIN);

    expect(moved.isOk()).toBe(true);
    expect(missing.isErr() && missing.error).toEqual({ type: 'BranchNotFound' });
    expect(none.isErr() && none.error.type).toBe('InvalidInput');
    expect(uow.users.rows.get(CAMILA.id)?.branchId).toBe(OTHER_BRANCH_ID);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        changes: { branchId: { before: MAIN_BRANCH_ID, after: OTHER_BRANCH_ID } },
      }),
    ]);
  });

  it('needs users:update', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute({ ...UNCHANGED, name: 'Otro' }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(uow.users.rows.get(CAMILA.id)?.name).toBe('Camila Pérez');
  });
});
