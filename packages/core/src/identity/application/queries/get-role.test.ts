import { describe, expect, it } from 'vitest';

import type { RoleDetail, UserPermissionsDetail } from '../../contracts';
import { InMemoryUserAccessQuery, StubRoleListQuery, TEST_ADMIN, TEST_AGENT } from '../../testing';
import { GetRole } from './get-role';
import { GetUserPermissions } from './get-user-permissions';

const ROLE: RoleDetail = {
  id: '00000000-0000-7000-8000-00000000000a',
  key: 'asesor',
  name: 'Asesor',
  description: undefined,
  isSystem: false,
  permissions: ['clients:read'],
  deletedAt: undefined,
};

describe('GetRole', () => {
  const roles = new StubRoleListQuery({ items: [], total: 0 }, [ROLE]);

  it('returns the role with its permissions', async () => {
    const result = await new GetRole({ roles }).execute({ roleId: ROLE.id }, TEST_ADMIN);

    expect(result.isOk() && result.value).toEqual(ROLE);
  });

  it('fails for a missing role and needs roles:read', async () => {
    const missing = await new GetRole({ roles }).execute(
      { roleId: '00000000-0000-7000-8000-00000000ffff' },
      TEST_ADMIN,
    );
    const forbidden = await new GetRole({ roles }).execute({ roleId: ROLE.id }, TEST_AGENT);

    expect(missing.isErr() && missing.error).toEqual({ type: 'RoleNotFound' });
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});

describe('GetUserPermissions', () => {
  const users = new InMemoryUserAccessQuery([
    {
      id: '00000000-0000-7000-8000-000000000001',
      name: 'Camila',
      email: 'camila@norde.com.ar',
      status: 'active',
      mustChangePassword: false,
      roles: [],
      rolePermissions: ['clients:read', 'rentals:*', 'clients:read'],
      userPermissions: [{ permission: 'rentals:delete', effect: 'deny' }],
    },
  ]);

  it('returns the role permissions without repeats and the own ones', async () => {
    const result = await new GetUserPermissions({ users }).execute(
      { userId: '00000000-0000-7000-8000-000000000001' },
      TEST_ADMIN,
    );

    const expected: UserPermissionsDetail = {
      userId: '00000000-0000-7000-8000-000000000001',
      name: 'Camila',
      rolePermissions: ['clients:read', 'rentals:*'],
      ownPermissions: [{ permission: 'rentals:delete', effect: 'deny' }],
    };
    expect(result.isOk() && result.value).toEqual(expected);
  });

  it('needs users:permissions', async () => {
    const result = await new GetUserPermissions({ users }).execute(
      { userId: '00000000-0000-7000-8000-000000000001' },
      TEST_AGENT,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
