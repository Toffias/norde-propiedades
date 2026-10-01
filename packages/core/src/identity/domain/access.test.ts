import { describe, expect, it } from 'vitest';

import { canSignIn, effectivePermissions, isPermissionClaim } from './access';

describe('effectivePermissions', () => {
  it('joins the permissions of every role without repeating them', () => {
    expect(
      effectivePermissions(['clients:read', 'properties:read', 'clients:read'], []).granted,
    ).toEqual(['clients:read', 'properties:read']);
  });

  it('adds the grants of the user', () => {
    expect(
      effectivePermissions(['clients:read'], [{ permission: 'clients:export', effect: 'grant' }]),
    ).toEqual({ granted: ['clients:export', 'clients:read'], denied: [] });
  });

  it('removes a denied permission even if a role or a grant gives it', () => {
    expect(
      effectivePermissions(
        ['clients:read', 'clients:delete'],
        [
          { permission: 'clients:delete', effect: 'deny' },
          { permission: 'clients:delete', effect: 'grant' },
        ],
      ),
    ).toEqual({ granted: ['clients:read'], denied: ['clients:delete'] });
  });

  it('keeps a deny that falls under a resource:* so the actor can apply it', () => {
    expect(
      effectivePermissions(['clients:*'], [{ permission: 'clients:delete', effect: 'deny' }]),
    ).toEqual({ granted: ['clients:*'], denied: ['clients:delete'] });
  });
});

describe('canSignIn', () => {
  it('lets only active users in', () => {
    expect(canSignIn('active')).toBe(true);
    expect(canSignIn('suspended')).toBe(false);
  });
});

describe('isPermissionClaim', () => {
  it('accepts resource:action and resource:*', () => {
    expect(isPermissionClaim('clients:read')).toBe(true);
    expect(isPermissionClaim('rental-contracts:*')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPermissionClaim('clients')).toBe(false);
    expect(isPermissionClaim('*:*')).toBe(false);
    expect(isPermissionClaim('Clients:Read')).toBe(false);
    expect(isPermissionClaim('clients:read:all')).toBe(false);
  });
});
