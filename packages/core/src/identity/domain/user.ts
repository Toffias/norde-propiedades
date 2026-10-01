import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { PermissionEffect, UserPermission, UserStatus } from './access';
import { isKnownPermission, type UnknownPermissionError } from './permission-catalog';
import type { UserEvent } from './user.events';

export type UserId = Id<'User'>;

export interface UserSnapshot {
  readonly id: UserId;
  readonly name: string;
  readonly email: Email;
  readonly phone: Phone | undefined;
  readonly status: UserStatus;
  /** Roles del usuario (al menos uno). IDs de `roles`, ordenados. */
  readonly roleIds: readonly string[];
  /**
   * Permisos propios, además de los de sus roles: `grant` suma uno y `deny` lo quita aunque venga
   * de un rol. Uno por permiso, ordenados.
   */
  readonly permissions: readonly UserPermission[];
  /** Entra con una contraseña temporal (alta o blanqueo) y tiene que cambiarla. */
  readonly mustChangePassword: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserNeedsRoleError {
  readonly type: 'UserNeedsRole';
}
export interface CannotSuspendSelfError {
  readonly type: 'CannotSuspendSelf';
}
export interface UserAlreadySuspendedError {
  readonly type: 'UserAlreadySuspended';
}
export interface UserAlreadyActiveError {
  readonly type: 'UserAlreadyActive';
}
export interface CannotChangeOwnPermissionsError {
  readonly type: 'CannotChangeOwnPermissions';
}
export interface DuplicatePermissionError {
  readonly type: 'DuplicatePermission';
  readonly permission: string;
}

const MAX_NAME_LENGTH = 120;

function normalizeRoles(roleIds: readonly string[]): Result<readonly string[], UserNeedsRoleError> {
  const unique = [...new Set(roleIds)].sort();
  // Sin rol no tiene ningún permiso: no podría hacer nada en el panel.
  if (unique.length === 0) return err({ type: 'UserNeedsRole' });
  return ok(unique);
}

/** Persona del equipo de Norde que usa el panel. Lo da de alta un administrador. */
export class User extends AggregateRoot<UserId, UserEvent> {
  #state: Omit<UserSnapshot, 'id'>;

  private constructor(id: UserId, state: Omit<UserSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** Alta con una contraseña temporal: en el primer ingreso tiene que cambiarla. */
  static create(input: {
    readonly id: UserId;
    readonly name: string;
    readonly email: Email;
    readonly phone?: Phone | undefined;
    readonly roleIds: readonly string[];
    readonly now: Date;
  }): Result<User, UserNeedsRoleError> {
    const roleIds = normalizeRoles(input.roleIds);
    if (roleIds.isErr()) return err(roleIds.error);

    const user = new User(input.id, {
      name: input.name.trim().slice(0, MAX_NAME_LENGTH),
      email: input.email,
      phone: input.phone,
      status: 'active',
      roleIds: roleIds.value,
      permissions: [],
      mustChangePassword: true,
      createdAt: input.now,
      updatedAt: input.now,
    });
    user.record({
      type: 'identity.user_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { userId: input.id },
    });
    return ok(user);
  }

  static restore(snapshot: UserSnapshot): User {
    const { id, ...state } = snapshot;
    return new User(id, state);
  }

  get email(): Email {
    return this.#state.email;
  }

  get status(): UserStatus {
    return this.#state.status;
  }

  get roleIds(): readonly string[] {
    return this.#state.roleIds;
  }

  get permissions(): readonly UserPermission[] {
    return this.#state.permissions;
  }

  get mustChangePassword(): boolean {
    return this.#state.mustChangePassword;
  }

  updateProfile(
    data: { readonly name: string; readonly email: Email; readonly phone: Phone | undefined },
    now: Date,
  ): void {
    this.#state = {
      ...this.#state,
      name: data.name.trim().slice(0, MAX_NAME_LENGTH),
      email: data.email,
      phone: data.phone,
      updatedAt: now,
    };
  }

  assignRoles(roleIds: readonly string[], now: Date): Result<void, UserNeedsRoleError> {
    const normalized = normalizeRoles(roleIds);
    if (normalized.isErr()) return err(normalized.error);
    const changed = normalized.value.join() !== this.#state.roleIds.join();
    if (!changed) return ok(undefined);

    this.#state = { ...this.#state, roleIds: normalized.value, updatedAt: now };
    this.record({
      type: 'identity.user_roles_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { userId: this.id, roleIds: normalized.value },
    });
    return ok(undefined);
  }

  /**
   * Reemplaza sus permisos propios. Cada permiso es del catálogo y aparece una sola vez. Nadie
   * cambia los suyos: se podría dar cualquier permiso, o quitarse el acceso sin vuelta atrás.
   */
  setOwnPermissions(
    permissions: readonly { readonly permission: string; readonly effect: PermissionEffect }[],
    by: string,
    now: Date,
  ): Result<
    void,
    CannotChangeOwnPermissionsError | UnknownPermissionError | DuplicatePermissionError
  > {
    if (by === this.id) return err({ type: 'CannotChangeOwnPermissions' });
    const valid: UserPermission[] = [];
    const seen = new Set<string>();
    for (const { permission, effect } of permissions) {
      if (!isKnownPermission(permission)) return err({ type: 'UnknownPermission', permission });
      if (seen.has(permission)) return err({ type: 'DuplicatePermission', permission });
      seen.add(permission);
      valid.push({ permission, effect });
    }
    valid.sort((a, b) => a.permission.localeCompare(b.permission));
    const key = (list: readonly UserPermission[]) =>
      list.map((p) => `${p.effect}:${p.permission}`).join();
    if (key(valid) === key(this.#state.permissions)) return ok(undefined);

    this.#state = { ...this.#state, permissions: valid, updatedAt: now };
    this.record({
      type: 'identity.user_permissions_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { userId: this.id },
    });
    return ok(undefined);
  }

  /**
   * Suspende el acceso al panel. El caso de uso cierra sus sesiones abiertas. Nadie se suspende
   * a sí mismo: un administrador podría quedar afuera sin que otro lo pueda reactivar.
   */
  suspend(by: string, now: Date): Result<void, CannotSuspendSelfError | UserAlreadySuspendedError> {
    if (by === this.id) return err({ type: 'CannotSuspendSelf' });
    if (this.#state.status === 'suspended') return err({ type: 'UserAlreadySuspended' });

    this.#state = { ...this.#state, status: 'suspended', updatedAt: now };
    this.record({
      type: 'identity.user_suspended',
      aggregateId: this.id,
      occurredAt: now,
      payload: { userId: this.id },
    });
    return ok(undefined);
  }

  reactivate(now: Date): Result<void, UserAlreadyActiveError> {
    if (this.#state.status === 'active') return err({ type: 'UserAlreadyActive' });

    this.#state = { ...this.#state, status: 'active', updatedAt: now };
    this.record({
      type: 'identity.user_reactivated',
      aggregateId: this.id,
      occurredAt: now,
      payload: { userId: this.id },
    });
    return ok(undefined);
  }

  /** Blanqueo: un administrador le puso una contraseña temporal. */
  resetPassword(now: Date): void {
    this.#state = { ...this.#state, mustChangePassword: true, updatedAt: now };
    this.record({
      type: 'identity.user_password_reset',
      aggregateId: this.id,
      occurredAt: now,
      payload: { userId: this.id },
    });
  }

  /** El usuario eligió su propia contraseña: deja de ser temporal. */
  passwordChanged(now: Date): void {
    this.#state = { ...this.#state, mustChangePassword: false, updatedAt: now };
  }

  toSnapshot(): UserSnapshot {
    return { id: this.id, ...this.#state };
  }
}
