// "Solo se otorga lo que se tiene" (#221) en cada command que da permisos o administra usuarios.

import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import {
  branchSnapshot,
  FakePasswordHasher,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  OTHER_PASSWORD,
  ROLE_AGENT_ID,
  ROLE_MANAGER_ID,
  roleSnapshot,
  seedBranch,
  seedRole,
  seedUser,
  TEMPORARY_PASSWORD,
  TEST_NOW,
  testUserId,
  userSnapshot,
} from '../../testing';

import { CreateRole } from './create-role';
import { CreateUser } from './create-user';
import { ReactivateUser } from './reactivate-user';
import { ResetUserPassword } from './reset-user-password';
import { ResetUserTwoFactor } from './reset-user-two-factor';
import { SetUserPermissions } from './set-user-permissions';
import { StartTokkoUsersImport } from './start-tokko-users-import';
import { SuspendUser } from './suspend-user';
import { UpdateRole } from './update-role';
import { UpdateUser } from './update-user';

const ROLE_ADMIN_ID = '00000000-0000-7000-8000-00000000000c';
/** Encargado de personal: administra usuarios y roles, pero no es administrador. */
const DELEGATE_ID = '00000000-0000-7000-8000-0000000000dd';
const DELEGATE_PERMISSIONS = [
  'users:read',
  'users:create',
  'users:update',
  'users:suspend',
  'users:reset-password',
  'users:permissions',
  'roles:read',
  'roles:create',
  'roles:update',
  'clients:read',
] as const;
const DELEGATE = Actor.user(DELEGATE_ID, DELEGATE_PERMISSIONS);

const AGENT_ROLE = roleSnapshot({ id: ROLE_AGENT_ID, key: 'agent', permissions: ['clients:read'] });
/** El rol del propio encargado: con `roles:update` podría agregarse cualquier cosa. */
const DELEGATE_ROLE = roleSnapshot({
  id: ROLE_MANAGER_ID,
  key: 'staff',
  name: 'Personal',
  permissions: [...DELEGATE_PERMISSIONS],
});
const ADMIN_ROLE = roleSnapshot({
  id: ROLE_ADMIN_ID,
  key: 'admin',
  name: 'Administrador',
  isSystem: true,
  permissions: ['cash:*', 'clients:*', 'roles:*', 'settings:*', 'users:*'],
});

const ADMIN = userSnapshot({
  id: testUserId('00000000-0000-7000-8000-0000000000aa'),
  name: 'Admin',
  roleIds: [ROLE_ADMIN_ID],
});
const CAMILA = userSnapshot();

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedRole(uow, AGENT_ROLE);
  seedRole(uow, DELEGATE_ROLE);
  seedRole(uow, ADMIN_ROLE);
  seedBranch(uow, branchSnapshot());
  seedUser(uow, ADMIN, { password: OTHER_PASSWORD, openSessions: 1, twoFactor: true });
  seedUser(uow, CAMILA, { password: OTHER_PASSWORD, twoFactor: true });
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const hasher = new FakePasswordHasher();
  return {
    uow,
    createRole: new CreateRole({ uow, ids, clock }),
    updateRole: new UpdateRole({ uow, clock }),
    createUser: new CreateUser({ uow, hasher, ids, clock }),
    updateUser: new UpdateUser({ uow, clock }),
    setPermissions: new SetUserPermissions({ uow, clock }),
    resetPassword: new ResetUserPassword({ uow, hasher, clock }),
    resetTwoFactor: new ResetUserTwoFactor({ uow }),
    suspend: new SuspendUser({ uow, clock }),
    reactivate: new ReactivateUser({ uow, clock }),
    tokkoImport: new StartTokkoUsersImport({ uow, configured: true, ids, clock }),
  };
}

const ESCALATION = { type: 'PermissionEscalation' };

describe('roles', () => {
  it('does not let roles:update add permissions the actor does not have, even to their own role', async () => {
    const { uow, updateRole } = setup();

    const result = await updateRole.execute(
      {
        roleId: DELEGATE_ROLE.id,
        name: DELEGATE_ROLE.name,
        permissions: [...DELEGATE_PERMISSIONS, 'users:*', 'cash:read'],
      },
      DELEGATE,
    );

    expect(result.isErr() && result.error).toMatchObject({
      ...ESCALATION,
      permissions: expect.arrayContaining(['users:*', 'cash:read']) as unknown,
    });
    expect(uow.roles.rows.get(DELEGATE_ROLE.id)?.permissions).toEqual(DELEGATE_ROLE.permissions);
    expect(uow.events.published).toEqual([]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('lets roles:update add what the actor has and remove anything', async () => {
    const { uow, updateRole } = setup();

    const result = await updateRole.execute(
      { roleId: AGENT_ROLE.id, name: AGENT_ROLE.name, permissions: ['users:read'] },
      DELEGATE,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.roles.rows.get(AGENT_ROLE.id)?.permissions).toEqual(['users:read']);
  });

  it('does not create a role with permissions the actor does not have', async () => {
    const { uow, createRole } = setup();

    const result = await createRole.execute({ name: 'Caja', permissions: ['cash:*'] }, DELEGATE);

    expect(result.isErr() && result.error).toMatchObject(ESCALATION);
    expect(uow.audit.entries).toEqual([]);
  });
});

describe('users', () => {
  it('does not let users:create create an administrator', async () => {
    const { uow, createUser } = setup();

    const result = await createUser.execute(
      {
        name: 'Lucía Gómez',
        email: 'lucia@norde.com.ar',
        branchId: MAIN_BRANCH_ID,
        roleIds: [ROLE_ADMIN_ID],
        temporaryPassword: TEMPORARY_PASSWORD,
      },
      DELEGATE,
    );

    expect(result.isErr() && result.error).toMatchObject(ESCALATION);
    expect(uow.users.rows.size).toBe(2);
    expect(uow.audit.entries).toEqual([]);
  });

  it('lets users:create create a user with roles the actor covers', async () => {
    const { createUser } = setup();

    const result = await createUser.execute(
      {
        name: 'Lucía Gómez',
        email: 'lucia@norde.com.ar',
        branchId: MAIN_BRANCH_ID,
        roleIds: [ROLE_AGENT_ID],
        temporaryPassword: TEMPORARY_PASSWORD,
      },
      DELEGATE,
    );

    expect(result.isOk()).toBe(true);
  });

  it('does not let users:update give a user the administrator role', async () => {
    const { uow, updateUser } = setup();

    const result = await updateUser.execute(
      {
        userId: CAMILA.id,
        name: CAMILA.name,
        email: 'camila@norde.com.ar',
        phone: '+5491166899124',
        branchId: MAIN_BRANCH_ID,
        roleIds: [ROLE_ADMIN_ID],
      },
      DELEGATE,
    );

    expect(result.isErr() && result.error).toMatchObject(ESCALATION);
    expect(uow.users.rows.get(CAMILA.id)?.roleIds).toEqual([ROLE_AGENT_ID]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('does not let users:permissions grant what the actor does not have', async () => {
    const { uow, setPermissions } = setup();

    const result = await setPermissions.execute(
      { userId: CAMILA.id, permissions: [{ permission: 'settings:update', effect: 'grant' }] },
      DELEGATE,
    );

    expect(result.isErr() && result.error).toEqual({
      type: 'PermissionEscalation',
      permissions: ['settings:update'],
    });
    expect(uow.users.rows.get(CAMILA.id)?.permissions).toEqual([]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('lets users:permissions deny something to a user the actor covers', async () => {
    const { setPermissions } = setup();

    const result = await setPermissions.execute(
      { userId: CAMILA.id, permissions: [{ permission: 'clients:read', effect: 'deny' }] },
      DELEGATE,
    );

    expect(result.isOk()).toBe(true);
  });

  it('does not let a delegated actor reset, suspend, edit or change an administrator', async () => {
    const { uow, resetPassword, resetTwoFactor, suspend, setPermissions, updateUser } = setup();
    const outranked = { type: 'UserHasMorePermissions' };

    const results = [
      await resetPassword.execute(
        { userId: ADMIN.id, temporaryPassword: TEMPORARY_PASSWORD },
        DELEGATE,
      ),
      await resetTwoFactor.execute({ userId: ADMIN.id }, DELEGATE),
      await suspend.execute({ userId: ADMIN.id }, DELEGATE),
      await setPermissions.execute(
        { userId: ADMIN.id, permissions: [{ permission: 'cash:read', effect: 'deny' }] },
        DELEGATE,
      ),
      await updateUser.execute(
        {
          userId: ADMIN.id,
          name: 'Otro nombre',
          email: 'camila@norde.com.ar',
          branchId: MAIN_BRANCH_ID,
          roleIds: [ROLE_ADMIN_ID],
        },
        DELEGATE,
      ),
    ];

    for (const result of results) expect(result.isErr() && result.error).toEqual(outranked);
    expect(uow.credentials.hashes.get(ADMIN.id)).toBe(`hashed:${OTHER_PASSWORD}`);
    expect(uow.users.rows.get(ADMIN.id)?.status).toBe('active');
    expect(uow.audit.entries).toEqual([]);
  });

  it('does not let a delegated actor reactivate an administrator', async () => {
    const { uow, reactivate } = setup();
    seedUser(uow, { ...ADMIN, status: 'suspended' });

    const result = await reactivate.execute({ userId: ADMIN.id }, DELEGATE);

    expect(result.isErr() && result.error).toEqual({ type: 'UserHasMorePermissions' });
  });

  it('lets a delegated actor reset the password of a user they cover', async () => {
    const { resetPassword } = setup();

    const result = await resetPassword.execute(
      { userId: CAMILA.id, temporaryPassword: TEMPORARY_PASSWORD },
      DELEGATE,
    );

    expect(result.isOk()).toBe(true);
  });

  it('does not start the Tokko import for who does not have the agent role permissions', async () => {
    const { uow, tokkoImport } = setup();

    const result = await tokkoImport.execute(
      {},
      Actor.user(DELEGATE_ID, ['users:create', 'users:read']),
    );

    expect(result.isErr() && result.error).toMatchObject(ESCALATION);
    expect(uow.events.published).toEqual([]);
  });
});
