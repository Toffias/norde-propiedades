import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { PermissionClaim } from './access';
import { isKnownPermission, type UnknownPermissionError } from './permission-catalog';
import type { RoleEvent } from './role.events';

export type RoleId = Id<'Role'>;

export interface RoleSnapshot {
  readonly id: RoleId;
  /** Identificador estable (`agent`, `asesor-junior`): lo usan los scripts y la migración. */
  readonly key: string;
  readonly name: string;
  readonly description: string | undefined;
  /** Los roles del sistema (los cuatro iniciales) no se borran ni se renombran. */
  readonly isSystem: boolean;
  /** Permisos del catálogo, ordenados y sin repetir. */
  readonly permissions: readonly PermissionClaim[];
  readonly deletedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SystemRoleCannotBeRenamedError {
  readonly type: 'SystemRoleCannotBeRenamed';
}
export interface SystemRoleCannotBeDeletedError {
  readonly type: 'SystemRoleCannotBeDeleted';
}
export interface RoleInUseError {
  readonly type: 'RoleInUse';
  readonly userCount: number;
}
export interface RoleAlreadyDeletedError {
  readonly type: 'RoleAlreadyDeleted';
}
export interface RoleNotDeletedError {
  readonly type: 'RoleNotDeleted';
}

const MAX_NAME_LENGTH = 80;
const MAX_KEY_LENGTH = 60;

/** Clave del rol a partir de su nombre: "Asesor Júnior" → `asesor-junior`. */
export function roleKeyFrom(name: string): string {
  const key = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_KEY_LENGTH)
    .replace(/-+$/, '');
  return key === '' ? 'rol' : key;
}

/** Solo permisos del catálogo (o `recurso:*` de un recurso del catálogo), ordenados y sin repetir. */
export function normalizePermissions(
  permissions: readonly string[],
): Result<readonly PermissionClaim[], UnknownPermissionError> {
  const known: PermissionClaim[] = [];
  for (const permission of new Set(permissions)) {
    if (!isKnownPermission(permission)) return err({ type: 'UnknownPermission', permission });
    known.push(permission);
  }
  return ok(known.sort());
}

function cleanDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Grupo de permisos que se asigna a los usuarios. Se edita desde el panel, sin tocar código. */
export class Role extends AggregateRoot<RoleId, RoleEvent> {
  #state: Omit<RoleSnapshot, 'id'>;

  private constructor(id: RoleId, state: Omit<RoleSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: RoleId;
    readonly name: string;
    readonly description?: string | undefined;
    readonly permissions: readonly string[];
    readonly now: Date;
  }): Result<Role, UnknownPermissionError> {
    const permissions = normalizePermissions(input.permissions);
    if (permissions.isErr()) return err(permissions.error);
    const name = input.name.trim().slice(0, MAX_NAME_LENGTH);

    const role = new Role(input.id, {
      key: roleKeyFrom(name),
      name,
      description: cleanDescription(input.description),
      isSystem: false,
      permissions: permissions.value,
      deletedAt: undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
    role.record({
      type: 'identity.role_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { roleId: input.id },
    });
    return ok(role);
  }

  static restore(snapshot: RoleSnapshot): Role {
    const { id, ...state } = snapshot;
    return new Role(id, state);
  }

  get key(): string {
    return this.#state.key;
  }

  get name(): string {
    return this.#state.name;
  }

  get isSystem(): boolean {
    return this.#state.isSystem;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /**
   * Nombre, descripción y permisos. Un rol del sistema no se renombra (su nombre lo reconoce todo
   * el equipo), pero sí se le ajustan los permisos.
   */
  update(
    data: {
      readonly name: string;
      readonly description: string | undefined;
      readonly permissions: readonly string[];
    },
    now: Date,
  ): Result<void, UnknownPermissionError | SystemRoleCannotBeRenamedError> {
    const name = data.name.trim().slice(0, MAX_NAME_LENGTH);
    if (this.#state.isSystem && name !== this.#state.name) {
      return err({ type: 'SystemRoleCannotBeRenamed' });
    }
    const permissions = normalizePermissions(data.permissions);
    if (permissions.isErr()) return err(permissions.error);

    const permissionsChanged = permissions.value.join() !== this.#state.permissions.join();
    this.#state = {
      ...this.#state,
      name,
      description: cleanDescription(data.description),
      permissions: permissions.value,
      updatedAt: now,
    };
    if (permissionsChanged) {
      this.record({
        type: 'identity.role_permissions_changed',
        aggregateId: this.id,
        occurredAt: now,
        payload: { roleId: this.id },
      });
    }
    return ok(undefined);
  }

  /** Baja lógica: queda en la papelera. Un rol con usuarios no se borra (hay que reasignarlos). */
  delete(
    usersWithRole: number,
    now: Date,
  ): Result<void, SystemRoleCannotBeDeletedError | RoleInUseError | RoleAlreadyDeletedError> {
    if (this.#state.isSystem) return err({ type: 'SystemRoleCannotBeDeleted' });
    if (this.isDeleted) return err({ type: 'RoleAlreadyDeleted' });
    if (usersWithRole > 0) return err({ type: 'RoleInUse', userCount: usersWithRole });

    this.#state = { ...this.#state, deletedAt: now, updatedAt: now };
    this.record({
      type: 'identity.role_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { roleId: this.id },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, RoleNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'RoleNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, updatedAt: now };
    this.record({
      type: 'identity.role_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { roleId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): RoleSnapshot {
    return { id: this.id, ...this.#state };
  }
}
