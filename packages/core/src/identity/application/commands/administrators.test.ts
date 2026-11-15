import { describe, expect, it } from 'vitest';

import { FixedClock } from '../../../shared/testing';
import {
  branchSnapshot,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  ROLE_AGENT_ID,
  roleSnapshot,
  seedBranch,
  seedRole,
  seedUser,
  TEST_ADMIN,
  TEST_NOW,
  testUserId,
  userSnapshot,
} from '../../testing';
import { SetUserPermissions } from './set-user-permissions';
import { SuspendUser } from './suspend-user';
import { UpdateRole } from './update-role';
import { UpdateUser } from './update-user';

const ADMIN_ROLE_ID = '00000000-0000-7000-8000-0000000000ad';
const ADMIN_PERMISSIONS = ['roles:*', 'users:*', 'clients:read'];
const ANA = userSnapshot({
  id: testUserId('00000000-0000-7000-8000-0000000000a1'),
  roleIds: [ADMIN_ROLE_ID],
});
const BRUNO = userSnapshot({
  id: testUserId('00000000-0000-7000-8000-0000000000a2'),
  roleIds: [ADMIN_ROLE_ID],
});

function setup(admins: readonly (typeof ANA)[] = [ANA, BRUNO]) {
  const uow = new InMemoryIdentityUnitOfWork();
  seedRole(
    uow,
    roleSnapshot({
      id: ADMIN_ROLE_ID,
      key: 'admin',
      name: 'Administrador',
      isSystem: true,
      permissions: ['clients:read', 'roles:*', 'users:*'],
    }),
  );
  seedRole(uow, roleSnapshot({ id: ROLE_AGENT_ID, key: 'agent' }));
  seedBranch(uow, branchSnapshot());
  for (const admin of admins) seedUser(uow, admin);
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    updateRole: new UpdateRole({ uow, clock }),
    suspend: new SuspendUser({ uow, clock }),
    updateUser: new UpdateUser({ uow, clock }),
    setPermissions: new SetUserPermissions({ uow, clock }),
  };
}

describe('the Administrador role', () => {
  it('cannot lose what it takes to manage users and roles', async () => {
    const { uow, updateRole } = setup();

    const result = await updateRole.execute(
      { roleId: ADMIN_ROLE_ID, name: 'Administrador', permissions: ['clients:read', 'roles:*'] },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'AdminRoleNeedsPermissions' });
    expect(uow.roles.rows.get(ADMIN_ROLE_ID)?.permissions).toEqual(ADMIN_PERMISSIONS.toSorted());
    expect(uow.audit.entries).toEqual([]);
  });

  it('can still change its other permissions, with exact or wildcard ones', async () => {
    const { uow, updateRole } = setup();

    const result = await updateRole.execute(
      {
        roleId: ADMIN_ROLE_ID,
        name: 'Administrador',
        permissions: ['roles:update', 'users:update', 'users:suspend', 'users:permissions'],
      },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.audit.entries).toHaveLength(1);
  });
});

describe('the last administrator', () => {
  it('cannot be suspended, but one of two can', async () => {
    const two = setup();
    expect((await two.suspend.execute({ userId: BRUNO.id }, TEST_ADMIN)).isOk()).toBe(true);
    // Bruno quedó suspendido: Ana es la última.
    const last = await two.suspend.execute({ userId: ANA.id }, TEST_ADMIN);

    expect(last.isErr() && last.error).toEqual({ type: 'LastAdministrator' });
    expect(two.uow.users.rows.get(ANA.id)?.status).toBe('active');
    expect(two.uow.audit.entries).toHaveLength(1);
  });

  it('does not lose the Administrador role', async () => {
    const { uow, updateUser } = setup([ANA]);

    const result = await updateUser.execute(
      {
        userId: ANA.id,
        name: ANA.name,
        email: ANA.email.value,
        phone: '+5491166899124',
        branchId: MAIN_BRANCH_ID,
        roleIds: [ROLE_AGENT_ID],
      },
      TEST_ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'LastAdministrator' });
    expect(uow.users.rows.get(ANA.id)?.roleIds).toEqual([ADMIN_ROLE_ID]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('cannot be denied an essential permission, but can be denied others', async () => {
    const { uow, setPermissions } = setup([ANA]);

    const denied = await setPermissions.execute(
      { userId: ANA.id, permissions: [{ permission: 'users:suspend', effect: 'deny' }] },
      TEST_ADMIN,
    );
    const other = await setPermissions.execute(
      { userId: ANA.id, permissions: [{ permission: 'clients:read', effect: 'deny' }] },
      TEST_ADMIN,
    );

    expect(denied.isErr() && denied.error).toEqual({ type: 'LastAdministrator' });
    expect(other.isOk()).toBe(true);
    expect(uow.users.rows.get(ANA.id)?.permissions).toEqual([
      { permission: 'clients:read', effect: 'deny' },
    ]);
  });
});
