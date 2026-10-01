import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock } from '../../../shared/testing';
import {
  ADMIN_USER_ID,
  InMemoryIdentityUnitOfWork,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  testUserId,
  userSnapshot,
} from '../../testing';
import { ReactivateUser } from './reactivate-user';
import { SuspendUser } from './suspend-user';

const CAMILA = userSnapshot();

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA, { openSessions: 2 });
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    suspend: new SuspendUser({ uow, clock }),
    reactivate: new ReactivateUser({ uow, clock }),
  };
}

describe('SuspendUser', () => {
  it('suspends the user, closes their open sessions and audits it', async () => {
    const { uow, suspend } = setup();

    const result = await suspend.execute({ userId: CAMILA.id }, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    expect(uow.users.rows.get(CAMILA.id)?.status).toBe('suspended');
    expect(uow.sessions.open.has(CAMILA.id)).toBe(false);
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.user_suspended']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'user.suspended',
        entityId: CAMILA.id,
        changes: { status: { before: 'active', after: 'suspended' } },
      }),
    ]);
  });

  it('does not let an administrator suspend themselves', async () => {
    const { uow, suspend } = setup();
    seedUser(uow, userSnapshot({ id: testUserId(ADMIN_USER_ID) }), { openSessions: 1 });

    const result = await suspend.execute({ userId: ADMIN_USER_ID }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'CannotSuspendSelf' });
    expect(uow.sessions.open.get(ADMIN_USER_ID)).toBe(1);
  });

  it('fails for an already suspended or missing user', async () => {
    const { suspend } = setup();
    await suspend.execute({ userId: CAMILA.id }, TEST_ADMIN);

    const again = await suspend.execute({ userId: CAMILA.id }, TEST_ADMIN);
    expect(again.isErr() && again.error).toEqual({ type: 'UserAlreadySuspended' });

    const missing = await suspend.execute(
      { userId: '00000000-0000-7000-8000-00000000ffff' },
      TEST_ADMIN,
    );
    expect(missing.isErr() && missing.error).toEqual({ type: 'UserNotFound' });
  });

  it('needs users:suspend, even with every other users permission', async () => {
    const { uow, suspend } = setup();
    const editor = Actor.user(ADMIN_USER_ID, ['users:read', 'users:update', 'users:create']);

    const forAgent = await suspend.execute({ userId: CAMILA.id }, TEST_AGENT);
    const forEditor = await suspend.execute({ userId: CAMILA.id }, editor);

    expect(forAgent.isErr() && forAgent.error).toEqual({ type: 'Forbidden' });
    expect(forEditor.isErr() && forEditor.error).toEqual({ type: 'Forbidden' });
    expect(uow.sessions.open.get(CAMILA.id)).toBe(2);
  });
});

describe('ReactivateUser', () => {
  it('gives back the access and audits it', async () => {
    const { uow, suspend, reactivate } = setup();
    await suspend.execute({ userId: CAMILA.id }, TEST_ADMIN);

    const result = await reactivate.execute({ userId: CAMILA.id }, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    expect(uow.users.rows.get(CAMILA.id)?.status).toBe('active');
    expect(uow.audit.entries.at(-1)).toEqual(
      expect.objectContaining({
        action: 'user.reactivated',
        changes: { status: { before: 'suspended', after: 'active' } },
      }),
    );
  });

  it('fails for an active user', async () => {
    const { reactivate } = setup();

    const result = await reactivate.execute({ userId: CAMILA.id }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'UserAlreadyActive' });
  });

  it('needs users:suspend', async () => {
    const { reactivate } = setup();

    const result = await reactivate.execute({ userId: CAMILA.id }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
