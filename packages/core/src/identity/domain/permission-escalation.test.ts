import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';

import type { PermissionClaim } from './access';
import { PERMISSION_CATALOG } from './permission-catalog';
import { ensureCanManageUser, ensureGrantsHeld, grantedClaims } from './permission-escalation';

function holdsOf(permissions: readonly PermissionClaim[], denied: readonly PermissionClaim[] = []) {
  const actor = Actor.user('00000000-0000-7000-8000-0000000000cc', permissions, denied);
  return (permission: PermissionClaim) => actor.can(permission);
}

const USER_ACTIONS = (
  PERMISSION_CATALOG.flatMap((group) => group.resources).find(
    (resource) => resource.resource === 'users',
  )?.permissions ?? []
).map((definition) => definition.permission);

describe('grantedClaims', () => {
  it('expands a wildcard into every catalog action and keeps the wildcard', () => {
    const claims = grantedClaims({ granted: ['users:*'], denied: [] });

    expect(claims.has('users:*')).toBe(true);
    expect(USER_ACTIONS.length).toBeGreaterThan(0);
    for (const action of USER_ACTIONS) expect(claims.has(action)).toBe(true);
  });

  it('removes a denied action and the wildcard that no longer is complete', () => {
    const claims = grantedClaims({ granted: ['users:*'], denied: ['users:create'] });

    expect(claims.has('users:create')).toBe(false);
    expect(claims.has('users:*')).toBe(false);
    expect(claims.has('users:read')).toBe(true);
  });
});

describe('ensureGrantsHeld', () => {
  it('lets the actor give what they have', () => {
    const result = ensureGrantsHeld(
      { granted: ['clients:read', 'clients:update'], denied: [] },
      holdsOf(['clients:*', 'roles:update']),
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects giving what the actor does not have, listing it', () => {
    const result = ensureGrantsHeld(
      { granted: ['clients:read', 'users:*', 'cash:read'], denied: [] },
      holdsOf(['clients:read', 'roles:update']),
    );

    expect(result.isErr() && result.error).toEqual({
      type: 'PermissionEscalation',
      permissions: expect.arrayContaining(['users:*', 'cash:read', 'users:create']) as unknown,
    });
  });

  it('only checks what is added: what was already there or is removed does not count', () => {
    const result = ensureGrantsHeld(
      { granted: ['settings:*'], denied: [] },
      holdsOf(['roles:update']),
      { granted: ['settings:*', 'users:*'], denied: [] },
    );

    expect(result.isOk()).toBe(true);
  });

  it('needs every action of a resource, not only the wildcard, to give the wildcard', () => {
    const result = ensureGrantsHeld(
      { granted: ['users:*'], denied: [] },
      holdsOf(['users:*'], ['users:reset-password']),
    );

    expect(result.isErr() && result.error).toMatchObject({ type: 'PermissionEscalation' });
  });

  it('treats lifting a deny as giving the permission', () => {
    const result = ensureGrantsHeld({ granted: ['users:*'], denied: [] }, holdsOf(['users:read']), {
      granted: ['users:*'],
      denied: ['users:*'],
    });

    expect(result.isErr() && result.error).toMatchObject({ type: 'PermissionEscalation' });
  });
});

describe('ensureCanManageUser', () => {
  it('lets the actor manage a user with fewer permissions', () => {
    const result = ensureCanManageUser(
      { granted: ['clients:read'], denied: [] },
      holdsOf(['clients:*', 'users:reset-password']),
    );

    expect(result.isOk()).toBe(true);
  });

  it('does not let a delegated permission touch an administrator', () => {
    const result = ensureCanManageUser(
      { granted: ['users:*', 'settings:*'], denied: [] },
      holdsOf(['users:reset-password', 'clients:read']),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'UserHasMorePermissions' });
  });
});
