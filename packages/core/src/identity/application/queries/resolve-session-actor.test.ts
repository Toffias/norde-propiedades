import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { InMemoryUserAccessQuery } from '../../testing';
import type { UserAccessRecord } from '../ports/user-access-query';
import { ResolveSessionActor } from './resolve-session-actor';

const AUTH = Actor.system('auth', ['sessions:resolve']);

const CAMILA: UserAccessRecord = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Camila Pérez',
  email: 'camila@norde.com.ar',
  status: 'active',
  roles: [
    { key: 'agent', name: 'Agente' },
    { key: 'rentals-admin', name: 'Administrativo de alquileres' },
  ],
  rolePermissions: ['clients:read', 'clients:update', 'rentals:*'],
  userPermissions: [
    { permission: 'clients:export', effect: 'grant' },
    { permission: 'rentals:delete', effect: 'deny' },
  ],
};

function setup(users: readonly UserAccessRecord[] = [CAMILA]) {
  return new ResolveSessionActor({ users: new InMemoryUserAccessQuery(users) });
}

describe('ResolveSessionActor', () => {
  it('builds the actor with the effective permissions and the profile', async () => {
    const result = await setup().execute({ userId: CAMILA.id, correlationId: 'req-1' }, AUTH);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { actor, profile } = result.value;
    expect(actor.id).toBe(CAMILA.id);
    expect(actor.kind).toBe('user');
    expect(actor.correlationId).toBe('req-1');
    expect(actor.can('clients:export')).toBe(true);
    expect(actor.can('rentals:update')).toBe(true);
    expect(actor.can('rentals:delete')).toBe(false);
    expect(actor.can('properties:read')).toBe(false);
    expect(profile).toEqual({
      id: CAMILA.id,
      name: 'Camila Pérez',
      email: 'camila@norde.com.ar',
      roles: CAMILA.roles,
    });
  });

  it('fails when the user of the session no longer exists', async () => {
    const result = await setup([]).execute({ userId: CAMILA.id }, AUTH);

    expect(result.isErr() && result.error).toEqual({ type: 'UserNotFound' });
  });

  it('does not let a suspended user in', async () => {
    const result = await setup([{ ...CAMILA, status: 'suspended' }]).execute(
      { userId: CAMILA.id },
      AUTH,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'UserSuspended' });
  });

  it('only runs for an actor allowed to resolve sessions', async () => {
    const result = await setup().execute({ userId: CAMILA.id }, Actor.system('web', []));

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
