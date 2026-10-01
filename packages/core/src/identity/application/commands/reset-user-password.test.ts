import { describe, expect, it } from 'vitest';

import { FixedClock } from '../../../shared/testing';
import {
  FakePasswordHasher,
  InMemoryIdentityUnitOfWork,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  userSnapshot,
  OTHER_PASSWORD,
  TEMPORARY_PASSWORD,
} from '../../testing';
import { ResetUserPassword } from './reset-user-password';

const CAMILA = userSnapshot();

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA, { password: OTHER_PASSWORD, openSessions: 1 });
  const useCase = new ResetUserPassword({
    uow,
    hasher: new FakePasswordHasher(),
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, useCase };
}

describe('ResetUserPassword', () => {
  it('sets the temporary password, closes the sessions and audits it without values', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { userId: CAMILA.id, temporaryPassword: TEMPORARY_PASSWORD },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.credentials.hashes.get(CAMILA.id)).toBe(`hashed:${TEMPORARY_PASSWORD}`);
    expect(uow.users.rows.get(CAMILA.id)?.mustChangePassword).toBe(true);
    expect(uow.sessions.open.has(CAMILA.id)).toBe(false);
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.user_password_reset']);
    expect(uow.audit.entries).toEqual([
      {
        kind: 'action',
        actorId: TEST_ADMIN.id,
        source: 'gestion',
        correlationId: 'req-1',
        action: 'user.password-reset',
        entityType: 'user',
        entityId: CAMILA.id,
        clientIds: [],
      },
    ]);
  });

  it('fails for a missing user', async () => {
    const { useCase } = setup();

    const result = await useCase.execute(
      { userId: '00000000-0000-7000-8000-00000000ffff', temporaryPassword: TEMPORARY_PASSWORD },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'UserNotFound' });
  });

  it('needs users:reset-password', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { userId: CAMILA.id, temporaryPassword: TEMPORARY_PASSWORD },
      TEST_AGENT,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(uow.credentials.hashes.get(CAMILA.id)).toBe(`hashed:${OTHER_PASSWORD}`);
  });
});
