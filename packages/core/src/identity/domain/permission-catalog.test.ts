import { describe, expect, it } from 'vitest';

import { isPermissionClaim } from './access';
import { isKnownPermission, PERMISSION_CATALOG } from './permission-catalog';

const ALL = PERMISSION_CATALOG.flatMap((group) =>
  group.resources.flatMap((resource) => resource.permissions),
);

describe('PERMISSION_CATALOG', () => {
  it('has well-formed permissions without repeats', () => {
    const permissions = ALL.map((p) => p.permission);

    expect(permissions.every((p) => isPermissionClaim(p))).toBe(true);
    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('only lists permissions of their own resource', () => {
    for (const group of PERMISSION_CATALOG) {
      for (const resource of group.resources) {
        for (const { permission } of resource.permissions) {
          expect(permission.startsWith(`${resource.resource}:`)).toBe(true);
        }
      }
    }
  });

  it('covers the permissions the use cases ask for', () => {
    for (const permission of [
      'clients:create',
      'clients:export',
      'clients:import',
      'clients:erase',
      'properties:read',
      'properties:search',
      'conversations:receive',
      'conversations:reply',
      'users:read',
      'users:create',
      'users:update',
      'users:suspend',
      'users:reset-password',
      'roles:read',
    ]) {
      expect(isKnownPermission(permission)).toBe(true);
    }
  });
});

describe('isKnownPermission', () => {
  it('accepts the wildcard of a known resource', () => {
    expect(isKnownPermission('clients:*')).toBe(true);
  });

  it('rejects unknown resources and actions', () => {
    expect(isKnownPermission('spaceships:*')).toBe(false);
    expect(isKnownPermission('clients:fly')).toBe(false);
    expect(isKnownPermission('clients')).toBe(false);
    // Solo lo usa el actor de sistema que arma las sesiones: no se asigna a un rol.
    expect(isKnownPermission('sessions:resolve')).toBe(false);
  });
});
