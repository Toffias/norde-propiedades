import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock } from '../../../shared/testing';
import {
  FakePasswordHasher,
  InMemoryIdentityUnitOfWork,
  seedUser,
  TEST_NOW,
  userSnapshot,
  OTHER_PASSWORD,
  OWN_PASSWORD,
  TEMPORARY_PASSWORD,
} from '../../testing';
import { ChangeOwnPassword } from './change-own-password';

const CAMILA = userSnapshot({ mustChangePassword: true });
// Con una contraseña temporal, la sesión no tiene permisos: igual puede cambiarla.
const CAMILA_SESSION = Actor.user(CAMILA.id, []);

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA, { password: TEMPORARY_PASSWORD });
  const useCase = new ChangeOwnPassword({
    uow,
    hasher: new FakePasswordHasher(),
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, useCase };
}

describe('ChangeOwnPassword', () => {
  it('replaces the temporary password and audits it without values', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { currentPassword: TEMPORARY_PASSWORD, newPassword: OWN_PASSWORD },
      CAMILA_SESSION,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.credentials.hashes.get(CAMILA.id)).toBe(`hashed:${OWN_PASSWORD}`);
    expect(uow.users.rows.get(CAMILA.id)?.mustChangePassword).toBe(false);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        actorId: CAMILA.id,
        action: 'user.password-changed',
        entityId: CAMILA.id,
      }),
    ]);
    expect(uow.audit.entries[0]).not.toHaveProperty('changes');
  });

  it('rejects a wrong current password', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(
      { currentPassword: OTHER_PASSWORD, newPassword: OWN_PASSWORD },
      CAMILA_SESSION,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'WrongPassword' });
    expect(uow.users.rows.get(CAMILA.id)?.mustChangePassword).toBe(true);
  });

  it('rejects keeping the same password', async () => {
    const { useCase } = setup();

    const result = await useCase.execute(
      { currentPassword: TEMPORARY_PASSWORD, newPassword: TEMPORARY_PASSWORD },
      CAMILA_SESSION,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'SamePassword' });
  });

  it('only works for the user of the session', async () => {
    const { useCase } = setup();

    const system = await useCase.execute(
      { currentPassword: TEMPORARY_PASSWORD, newPassword: OWN_PASSWORD },
      Actor.system('import', ['users:*']),
    );
    const ghost = await useCase.execute(
      { currentPassword: TEMPORARY_PASSWORD, newPassword: OWN_PASSWORD },
      Actor.user('00000000-0000-7000-8000-00000000ffff', []),
    );

    expect(system.isErr() && system.error).toEqual({ type: 'Forbidden' });
    expect(ghost.isErr() && ghost.error).toEqual({ type: 'UserNotFound' });
  });
});
