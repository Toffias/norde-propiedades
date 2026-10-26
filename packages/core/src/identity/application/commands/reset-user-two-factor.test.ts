import { describe, expect, it } from 'vitest';

import {
  InMemoryIdentityUnitOfWork,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  userSnapshot,
} from '../../testing';
import { ResetUserTwoFactor } from './reset-user-two-factor';

const CAMILA = userSnapshot();

function setup({ twoFactor = true }: { readonly twoFactor?: boolean } = {}) {
  const uow = new InMemoryIdentityUnitOfWork();
  seedUser(uow, CAMILA, { twoFactor });
  return { uow, useCase: new ResetUserTwoFactor({ uow }) };
}

describe('ResetUserTwoFactor', () => {
  it('removes the second factor and audits it', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute({ userId: CAMILA.id }, TEST_ADMIN);

    expect(result.isOk()).toBe(true);
    expect(uow.credentials.twoFactor.has(CAMILA.id)).toBe(false);
    expect(uow.audit.entries).toEqual([
      {
        kind: 'action',
        actorId: TEST_ADMIN.id,
        source: 'gestion',
        correlationId: 'req-1',
        action: 'user.two-factor-reset',
        entityType: 'user',
        entityId: CAMILA.id,
        clientIds: [],
      },
    ]);
  });

  it('fails when the user does not have it enabled', async () => {
    const { uow, useCase } = setup({ twoFactor: false });

    const result = await useCase.execute({ userId: CAMILA.id }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'TwoFactorNotEnabled' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('fails for a missing user', async () => {
    const { useCase } = setup();

    const result = await useCase.execute(
      { userId: '00000000-0000-7000-8000-00000000ffff' },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'UserNotFound' });
  });

  it('rejects an invalid user ID', async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ userId: 'camila' }, TEST_ADMIN);

    expect(result.isErr() && result.error).toMatchObject({ type: 'InvalidInput' });
  });

  it('needs users:reset-password', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute({ userId: CAMILA.id }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(uow.credentials.twoFactor.has(CAMILA.id)).toBe(true);
  });
});
