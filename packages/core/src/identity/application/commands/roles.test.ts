import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import {
  InMemoryIdentityUnitOfWork,
  ROLE_AGENT_ID,
  roleSnapshot,
  seedRole,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  userSnapshot,
} from '../../testing';
import { CreateRole } from './create-role';
import { DeleteRole } from './delete-role';
import { RestoreRole } from './restore-role';
import { UpdateRole } from './update-role';

const ASESOR = roleSnapshot({ id: ROLE_AGENT_ID, key: 'asesor', name: 'Asesor' });

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  seedRole(uow, ASESOR);
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    create: new CreateRole({ uow, ids: new SequentialIdGenerator(), clock }),
    update: new UpdateRole({ uow, clock }),
    remove: new DeleteRole({ uow, clock }),
    restore: new RestoreRole({ uow, clock }),
  };
}

describe('CreateRole', () => {
  it('creates the role and audits its initial values', async () => {
    const { uow, create } = setup();

    const result = await create.execute(
      { name: 'Captador', permissions: ['properties:create', 'clients:read'] },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(uow.roles.rows.get(result.value.roleId)).toMatchObject({
      key: 'captador',
      permissions: ['clients:read', 'properties:create'],
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.role_created']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'role.created',
        entityType: 'role',
        entityId: result.value.roleId,
        changes: {
          name: { before: null, after: 'Captador' },
          permissions: { before: null, after: ['clients:read', 'properties:create'] },
        },
      }),
    ]);
  });

  it('rejects a name already in use and a permission outside the catalog', async () => {
    const { uow, create } = setup();

    const taken = await create.execute({ name: 'ASESOR', permissions: [] }, TEST_ADMIN);
    const unknown = await create.execute(
      { name: 'Otro', permissions: ['clients:fly'] },
      TEST_ADMIN,
    );

    expect(taken.isErr() && taken.error).toEqual({ type: 'RoleNameTaken' });
    expect(unknown.isErr() && unknown.error).toEqual({
      type: 'UnknownPermission',
      permission: 'clients:fly',
    });
    expect(uow.roles.rows.size).toBe(1);
  });

  it('needs roles:create', async () => {
    const result = await setup().create.execute({ name: 'Otro', permissions: [] }, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});

describe('UpdateRole', () => {
  it('audits only what changed, with the permissions before and after', async () => {
    const { uow, update } = setup();

    const result = await update.execute(
      { roleId: ASESOR.id, name: 'Asesor', permissions: ['clients:read', 'clients:export'] },
      TEST_ADMIN,
    );

    expect(result.isOk()).toBe(true);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'role.updated',
        changes: {
          permissions: { before: ['clients:read'], after: ['clients:export', 'clients:read'] },
        },
      }),
    ]);
    expect(uow.events.published.map((e) => e.type)).toEqual(['identity.role_permissions_changed']);
  });

  it('does not save anything when nothing changed', async () => {
    const { uow, update } = setup();

    await update.execute(
      { roleId: ASESOR.id, name: 'Asesor', permissions: ['clients:read'] },
      TEST_ADMIN,
    );

    expect(uow.roles.updatedBy.size).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('does not rename a system role or take the name of another', async () => {
    const { uow, update } = setup();
    seedRole(
      uow,
      roleSnapshot({
        id: '00000000-0000-7000-8000-00000000000b',
        key: 'agent',
        name: 'Agente',
        isSystem: true,
      }),
    );

    const renamed = await update.execute(
      { roleId: '00000000-0000-7000-8000-00000000000b', name: 'Vendedor', permissions: [] },
      TEST_ADMIN,
    );
    const taken = await update.execute(
      { roleId: ASESOR.id, name: 'Agente', permissions: [] },
      TEST_ADMIN,
    );

    expect(renamed.isErr() && renamed.error).toEqual({ type: 'SystemRoleCannotBeRenamed' });
    expect(taken.isErr() && taken.error).toEqual({ type: 'RoleNameTaken' });
  });

  it('does not edit a role in the trash or a missing one', async () => {
    const { uow, update } = setup();
    seedRole(uow, { ...ASESOR, deletedAt: TEST_NOW });

    const trashed = await update.execute(
      { roleId: ASESOR.id, name: 'Asesor', permissions: [] },
      TEST_ADMIN,
    );
    const missing = await update.execute(
      { roleId: '00000000-0000-7000-8000-00000000ffff', name: 'Asesor', permissions: [] },
      TEST_ADMIN,
    );

    expect(trashed.isErr() && trashed.error).toEqual({ type: 'RoleNotFound' });
    expect(missing.isErr() && missing.error).toEqual({ type: 'RoleNotFound' });
  });

  it('needs roles:update', async () => {
    const result = await setup().update.execute(
      { roleId: ASESOR.id, name: 'Asesor', permissions: ['clients:*'] },
      Actor.user('00000000-0000-7000-8000-0000000000cc', ['roles:read', 'roles:create']),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});

describe('DeleteRole and RestoreRole', () => {
  it('sends an unused role to the trash and brings it back, auditing both', async () => {
    const { uow, remove, restore } = setup();

    expect((await remove.execute({ roleId: ASESOR.id }, TEST_ADMIN)).isOk()).toBe(true);
    expect(uow.roles.rows.get(ASESOR.id)?.deletedAt).toEqual(TEST_NOW);
    expect(await uow.roles.findExistingIds([ASESOR.id])).toEqual([]);

    expect((await restore.execute({ roleId: ASESOR.id }, TEST_ADMIN)).isOk()).toBe(true);
    expect(uow.roles.rows.get(ASESOR.id)?.deletedAt).toBeUndefined();
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['role.deleted', 'role.restored']);
  });

  it('does not delete a role that users still have', async () => {
    const { uow, remove } = setup();
    seedUser(uow, userSnapshot({ roleIds: [ASESOR.id] }));

    const result = await remove.execute({ roleId: ASESOR.id }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'RoleInUse', userCount: 1 });
    expect(uow.roles.rows.get(ASESOR.id)?.deletedAt).toBeUndefined();
  });

  it('needs roles:delete for both', async () => {
    const { remove, restore } = setup();

    const removed = await remove.execute({ roleId: ASESOR.id }, TEST_AGENT);
    const restored = await restore.execute({ roleId: ASESOR.id }, TEST_AGENT);

    expect(removed.isErr() && removed.error).toEqual({ type: 'Forbidden' });
    expect(restored.isErr() && restored.error).toEqual({ type: 'Forbidden' });
  });

  it('fails to restore a role that is not in the trash', async () => {
    const result = await setup().restore.execute({ roleId: ASESOR.id }, TEST_ADMIN);

    expect(result.isErr() && result.error).toEqual({ type: 'RoleNotDeleted' });
  });
});
