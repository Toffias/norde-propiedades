import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';

import { User } from './user';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const ID = userId('00000000-0000-7000-8000-000000000001');
const ADMIN_ID = '00000000-0000-7000-8000-0000000000aa';
const ROLE_A = '00000000-0000-7000-8000-00000000000a';
const ROLE_B = '00000000-0000-7000-8000-00000000000b';

function userId(raw: string) {
  const id = parseId<'User'>(raw);
  if (id.isErr()) throw new Error('invalid test id');
  return id.value;
}

function email(raw: string) {
  const created = Email.create(raw);
  if (created.isErr()) throw new Error('invalid test email');
  return created.value;
}

function newUser(roleIds: readonly string[] = [ROLE_A]) {
  const created = User.create({
    id: ID,
    name: '  Camila Pérez ',
    email: email('camila@norde.com.ar'),
    roleIds,
    now: NOW,
  });
  if (created.isErr()) throw new Error('could not create the test user');
  return created.value;
}

describe('User.create', () => {
  it('starts active, with a temporary password and its roles sorted without repeats', () => {
    const user = newUser([ROLE_B, ROLE_A, ROLE_B]);

    expect(user.toSnapshot()).toMatchObject({
      name: 'Camila Pérez',
      status: 'active',
      mustChangePassword: true,
      roleIds: [ROLE_A, ROLE_B],
      createdAt: NOW,
    });
    expect(user.pullEvents()).toEqual([
      {
        type: 'identity.user_created',
        aggregateId: ID,
        occurredAt: NOW,
        payload: { userId: ID },
      },
    ]);
  });

  it('needs at least one role', () => {
    const created = User.create({
      id: ID,
      name: 'Camila',
      email: email('camila@norde.com.ar'),
      roleIds: [],
      now: NOW,
    });

    expect(created.isErr() && created.error).toEqual({ type: 'UserNeedsRole' });
  });
});

describe('User.assignRoles', () => {
  it('changes the roles and records the event', () => {
    const user = newUser();
    user.pullEvents();

    expect(user.assignRoles([ROLE_B], LATER).isOk()).toBe(true);
    expect(user.roleIds).toEqual([ROLE_B]);
    expect(user.pullEvents()).toMatchObject([
      { type: 'identity.user_roles_changed', payload: { roleIds: [ROLE_B] } },
    ]);
  });

  it('does nothing when the roles are the same in another order', () => {
    const user = newUser([ROLE_A, ROLE_B]);
    user.pullEvents();

    user.assignRoles([ROLE_B, ROLE_A], LATER);

    expect(user.pullEvents()).toEqual([]);
    expect(user.toSnapshot().updatedAt).toEqual(NOW);
  });

  it('does not leave a user without roles', () => {
    const user = newUser();

    expect(user.assignRoles([], LATER).isErr()).toBe(true);
    expect(user.roleIds).toEqual([ROLE_A]);
  });
});

describe('User.suspend and reactivate', () => {
  it('suspends and reactivates the user', () => {
    const user = newUser();
    user.pullEvents();

    expect(user.suspend(ADMIN_ID, LATER).isOk()).toBe(true);
    expect(user.status).toBe('suspended');
    expect(user.reactivate(LATER).isOk()).toBe(true);
    expect(user.status).toBe('active');
    expect(user.pullEvents().map((e) => e.type)).toEqual([
      'identity.user_suspended',
      'identity.user_reactivated',
    ]);
  });

  it('does not let a user suspend themselves', () => {
    const user = newUser();

    const result = user.suspend(ID, LATER);

    expect(result.isErr() && result.error).toEqual({ type: 'CannotSuspendSelf' });
    expect(user.status).toBe('active');
  });

  it('rejects suspending twice or reactivating an active user', () => {
    const user = newUser();
    user.suspend(ADMIN_ID, LATER);

    const twice = user.suspend(ADMIN_ID, LATER);
    expect(twice.isErr() && twice.error).toEqual({ type: 'UserAlreadySuspended' });

    user.reactivate(LATER);
    const again = user.reactivate(LATER);
    expect(again.isErr() && again.error).toEqual({ type: 'UserAlreadyActive' });
  });
});

describe('User passwords', () => {
  it('needs a new password after a reset, and not after changing it', () => {
    const user = newUser();
    user.passwordChanged(LATER);
    expect(user.mustChangePassword).toBe(false);
    user.pullEvents();

    user.resetPassword(LATER);

    expect(user.mustChangePassword).toBe(true);
    expect(user.pullEvents().map((e) => e.type)).toEqual(['identity.user_password_reset']);
  });
});

describe('User.setOwnPermissions', () => {
  it('keeps one entry per permission, sorted, and records the change', () => {
    const user = newUser();
    user.pullEvents();

    const result = user.setOwnPermissions(
      [
        { permission: 'rentals:delete', effect: 'deny' },
        { permission: 'clients:export', effect: 'grant' },
      ],
      ADMIN_ID,
      LATER,
    );

    expect(result.isOk()).toBe(true);
    expect(user.permissions).toEqual([
      { permission: 'clients:export', effect: 'grant' },
      { permission: 'rentals:delete', effect: 'deny' },
    ]);
    expect(user.pullEvents().map((e) => e.type)).toEqual(['identity.user_permissions_changed']);
  });

  it('rejects permissions outside the catalog, repeats and changing your own', () => {
    const user = newUser();

    const unknown = user.setOwnPermissions(
      [{ permission: 'x:y', effect: 'grant' }],
      ADMIN_ID,
      LATER,
    );
    const repeated = user.setOwnPermissions(
      [
        { permission: 'clients:read', effect: 'grant' },
        { permission: 'clients:read', effect: 'deny' },
      ],
      ADMIN_ID,
      LATER,
    );
    const own = user.setOwnPermissions([], ID, LATER);

    expect(unknown.isErr() && unknown.error.type).toBe('UnknownPermission');
    expect(repeated.isErr() && repeated.error.type).toBe('DuplicatePermission');
    expect(own.isErr() && own.error.type).toBe('CannotChangeOwnPermissions');
    expect(user.permissions).toEqual([]);
  });
});
