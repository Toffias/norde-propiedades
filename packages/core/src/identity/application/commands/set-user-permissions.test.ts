import { describe, expect, it } from 'vitest';

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
import { SetUserPermissions } from './set-user-permissions';

const CAMILA = userSnapshot({ permissions: [{ permission: 'clients:export', effect: 'grant' }] });

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA);
  const useCase = new SetUserPermissions({ uow, clock: new FixedClock(TEST_NOW) });
  return { uow, useCase };
}

describe('SetUserPermissions', () => {
  it('replaces the own permissions and audits them against the user', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      {
        userId: CAMILA.id,
        permissions: [
          { permission: 'rentals:delete', effect: 'deny' },
          { permission: 'clients:export', effect: 'grant' },
        ],
      },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.users.rows.get(CAMILA.id)?.permissions).toEqual([
      { permission: 'clients:export', effect: 'grant' },
      { permission: 'rentals:delete', effect: 'deny' },
    ]);
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.user_permissions_changed']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'user.permissions-changed',
        entityType: 'user',
        entityId: CAMILA.id,
        changes: {
          permissions: {
            before: ['grant:clients:export'],
            after: ['grant:clients:export', 'deny:rentals:delete'],
          },
        },
      }),
    ]);
  });

  it('does nothing when the permissions are the same', async () => {
    const { uow, useCase } = setup();

    await useCase.execute(
      { userId: CAMILA.id, permissions: [{ permission: 'clients:export', effect: 'grant' }] },
      TEST_ADMIN,
    );

    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects unknown or repeated permissions', async () => {
    const { useCase } = setup();

    const unknown = await useCase.execute(
      { userId: CAMILA.id, permissions: [{ permission: 'clients:fly', effect: 'grant' }] },
      TEST_ADMIN,
    );
    const repeated = await useCase.execute(
      {
        userId: CAMILA.id,
        permissions: [
          { permission: 'clients:read', effect: 'grant' },
          { permission: 'clients:read', effect: 'deny' },
        ],
      },
      TEST_ADMIN,
    );

    expect(unknown.isErr() && unknown.error).toEqual({
      type: 'UnknownPermission',
      permission: 'clients:fly',
    });
    expect(repeated.isErr() && repeated.error).toEqual({
      type: 'DuplicatePermission',
      permission: 'clients:read',
    });
  });

  it('does not let anyone change their own permissions', async () => {
    const { uow, useCase } = setup();
    seedUser(uow, userSnapshot({ id: testUserId(ADMIN_USER_ID) }));

    const result = await useCase.execute(
      { userId: ADMIN_USER_ID, permissions: [{ permission: 'settings:*', effect: 'grant' }] },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'CannotChangeOwnPermissions' });
  });

  it('needs users:permissions', async () => {
    const { useCase } = setup();

    const result = await useCase.execute(
      { userId: CAMILA.id, permissions: [{ permission: 'clients:*', effect: 'grant' }] },
      TEST_AGENT,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
