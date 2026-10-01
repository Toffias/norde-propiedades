import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';

import { normalizePermissions, Role, roleKeyFrom, type RoleSnapshot } from './role';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');

function roleId() {
  const id = parseId<'Role'>('00000000-0000-7000-8000-00000000000a');
  if (id.isErr()) throw new Error('invalid test id');
  return id.value;
}

function newRole(permissions: readonly string[] = ['clients:read']) {
  const created = Role.create({
    id: roleId(),
    name: ' Asesor Júnior ',
    description: '  ',
    permissions,
    now: NOW,
  });
  if (created.isErr()) throw new Error('could not create the test role');
  return created.value;
}

function systemRole(): Role {
  const snapshot: RoleSnapshot = {
    ...newRole().toSnapshot(),
    key: 'agent',
    name: 'Agente / Asesor',
    isSystem: true,
  };
  return Role.restore(snapshot);
}

describe('roleKeyFrom', () => {
  it('turns the name into a stable key without accents or symbols', () => {
    expect(roleKeyFrom('Asesor Júnior')).toBe('asesor-junior');
    expect(roleKeyFrom('Gerente / Broker')).toBe('gerente-broker');
    expect(roleKeyFrom('  ¡¡ ')).toBe('rol');
  });
});

describe('normalizePermissions', () => {
  it('sorts and removes repeats', () => {
    const result = normalizePermissions(['properties:read', 'clients:*', 'properties:read']);

    expect(result.isOk() && result.value).toEqual(['clients:*', 'properties:read']);
  });

  it('rejects a permission outside the catalog', () => {
    const result = normalizePermissions(['clients:read', 'clients:fly']);

    expect(result.isErr() && result.error).toEqual({
      type: 'UnknownPermission',
      permission: 'clients:fly',
    });
  });
});

describe('Role', () => {
  it('is created with a key from its name and records the event', () => {
    const role = newRole();

    expect(role.toSnapshot()).toMatchObject({
      key: 'asesor-junior',
      name: 'Asesor Júnior',
      description: undefined,
      isSystem: false,
      permissions: ['clients:read'],
    });
    expect(role.pullEvents().map((e) => e.type)).toEqual(['identity.role_created']);
  });

  it('changes its permissions and records the event only when they change', () => {
    const role = newRole();
    role.pullEvents();

    role.update(
      { name: 'Asesor Júnior', description: 'Recién llegado', permissions: ['clients:read'] },
      LATER,
    );
    expect(role.pullEvents()).toEqual([]);

    role.update(
      {
        name: 'Asesor Júnior',
        description: undefined,
        permissions: ['clients:read', 'clients:create'],
      },
      LATER,
    );
    expect(role.toSnapshot().permissions).toEqual(['clients:create', 'clients:read']);
    expect(role.pullEvents().map((e) => e.type)).toEqual(['identity.role_permissions_changed']);
  });

  it('keeps the name of a system role but lets its permissions change', () => {
    const role = systemRole();

    const renamed = role.update(
      { name: 'Vendedor', description: undefined, permissions: ['clients:read'] },
      LATER,
    );
    const adjusted = role.update(
      { name: 'Agente / Asesor', description: undefined, permissions: ['clients:*'] },
      LATER,
    );

    expect(renamed.isErr() && renamed.error).toEqual({ type: 'SystemRoleCannotBeRenamed' });
    expect(adjusted.isOk()).toBe(true);
    expect(role.toSnapshot().permissions).toEqual(['clients:*']);
  });

  it('goes to the trash only without users, and comes back', () => {
    const role = newRole();
    role.pullEvents();

    const inUse = role.delete(2, LATER);
    expect(inUse.isErr() && inUse.error).toEqual({ type: 'RoleInUse', userCount: 2 });

    expect(role.delete(0, LATER).isOk()).toBe(true);
    expect(role.isDeleted).toBe(true);
    const twice = role.delete(0, LATER);
    expect(twice.isErr() && twice.error).toEqual({ type: 'RoleAlreadyDeleted' });

    expect(role.restoreFromTrash(LATER).isOk()).toBe(true);
    expect(role.isDeleted).toBe(false);
    const again = role.restoreFromTrash(LATER);
    expect(again.isErr() && again.error).toEqual({ type: 'RoleNotDeleted' });
    expect(role.pullEvents().map((e) => e.type)).toEqual([
      'identity.role_deleted',
      'identity.role_restored',
    ]);
  });

  it('never deletes a system role', () => {
    const result = systemRole().delete(0, LATER);

    expect(result.isErr() && result.error).toEqual({ type: 'SystemRoleCannotBeDeleted' });
  });
});
