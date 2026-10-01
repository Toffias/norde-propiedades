import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import type { CreateUserInput } from '../../contracts';
import {
  FakePasswordHasher,
  InMemoryIdentityUnitOfWork,
  ROLE_AGENT_ID,
  ROLE_MANAGER_ID,
  branchSnapshot,
  MAIN_BRANCH_ID,
  roleSnapshot,
  seedBranch,
  seedRole,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  userSnapshot,
  TEMPORARY_PASSWORD,
} from '../../testing';
import { CreateUser } from './create-user';

const INPUT: CreateUserInput = {
  name: 'Lucía Gómez',
  email: 'Lucia@Norde.com.ar',
  phone: '+54 9 11 6689-9124',
  roleIds: [ROLE_MANAGER_ID, ROLE_AGENT_ID],
  temporaryPassword: TEMPORARY_PASSWORD,
};

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedRole(uow, roleSnapshot({ id: ROLE_AGENT_ID, key: 'agent' }));
  seedRole(uow, roleSnapshot({ id: ROLE_MANAGER_ID, key: 'manager' }));
  const useCase = new CreateUser({
    uow,
    hasher: new FakePasswordHasher(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, useCase };
}

describe('CreateUser', () => {
  it('creates the user with a temporary password and audits the initial values', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(INPUT, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { userId } = result.value;
    const saved = uow.users.rows.get(userId);
    expect(saved).toMatchObject({
      name: 'Lucía Gómez',
      status: 'active',
      mustChangePassword: true,
      roleIds: [ROLE_AGENT_ID, ROLE_MANAGER_ID],
    });
    expect(saved?.email.value).toBe('lucia@norde.com.ar');
    expect(uow.users.updatedBy.get(userId)).toBe(TEST_ADMIN.id);
    // Se guarda el hash, nunca la contraseña.
    expect(uow.credentials.hashes.get(userId)).toBe(`hashed:${TEMPORARY_PASSWORD}`);
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.user_created']);
    expect(uow.audit.entries).toEqual([
      {
        kind: 'created',
        actorId: TEST_ADMIN.id,
        source: 'gestion',
        correlationId: 'req-1',
        action: 'user.created',
        entityType: 'user',
        entityId: userId,
        clientIds: [],
        changes: {
          name: { before: null, after: 'Lucía Gómez' },
          email: { before: null, after: 'lucia@norde.com.ar' },
          phone: { before: null, after: '+5491166899124' },
          status: { before: null, after: 'active' },
          roleIds: { before: null, after: [ROLE_AGENT_ID, ROLE_MANAGER_ID] },
        },
      },
    ]);
  });

  it('rejects an email that another user already has', async () => {
    const { uow, useCase } = setup();
    seedUser(uow, userSnapshot());

    const result = await useCase.execute({ ...INPUT, email: 'CAMILA@norde.com.ar' }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'EmailTaken' });
    expect(uow.users.rows.size).toBe(1);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects a role that does not exist', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { ...INPUT, roleIds: ['00000000-0000-7000-8000-00000000ffff'] },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'RoleNotFound' });
    expect(uow.users.rows.size).toBe(0);
  });

  it('assigns the branch, which has to exist', async () => {
    const { uow, useCase } = setup();
    seedBranch(uow, branchSnapshot());

    const inBranch = await useCase.execute({ ...INPUT, branchId: MAIN_BRANCH_ID }, TEST_ADMIN);
    const missing = await useCase.execute(
      { ...INPUT, email: 'otra@norde.com.ar', branchId: '00000000-0000-7000-8000-0000000000ff' },
      TEST_ADMIN,
    );

    expect(inBranch.isOk() && uow.users.rows.get(inBranch.value.userId)?.branchId).toBe(
      MAIN_BRANCH_ID,
    );
    expect(missing.isErr() && missing.error).toEqual({ type: 'BranchNotFound' });
  });

  it('rejects an invalid phone or input', async () => {
    const { useCase } = setup();

    const phone = await useCase.execute({ ...INPUT, phone: '123' }, TEST_ADMIN);
    expect(phone.isErr() && phone.error).toEqual({ type: 'InvalidPhone' });

    const short = await useCase.execute({ ...INPUT, temporaryPassword: 'corta' }, TEST_ADMIN);
    expect(short.isErr() && short.error.type).toBe('InvalidInput');
  });

  it('needs users:create', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(INPUT, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(uow.users.rows.size).toBe(0);
  });
});
