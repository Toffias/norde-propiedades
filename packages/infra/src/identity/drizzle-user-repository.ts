import {
  isKnownPermission,
  PERMISSION_EFFECTS,
  USER_STATUSES,
  User,
  type UserId,
  type UserRepository,
} from '@norde/core/identity';
import { Email, parseId, Phone, type Result } from '@norde/core/shared';
import { and, asc, eq, notInArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { userPermissions, userRoles, users } from '../db/schema';

const Status = z.enum(USER_STATUSES);
const Effect = z.enum(PERMISSION_EFFECTS);

function storedValue<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the users table');
  return result.value;
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: UserId) {
    return this.findOneWhere(eq(users.id, id));
  }

  findByEmail(email: Email) {
    return this.findOneWhere(eq(users.email, email.value));
  }

  async save(user: User, actorId: string): Promise<void> {
    const s = user.toSnapshot();
    const row = {
      id: s.id,
      name: s.name,
      email: s.email.value,
      phoneE164: s.phone?.e164 ?? null,
      branchId: s.branchId ?? null,
      status: s.status,
      mustChangePassword: s.mustChangePassword,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      createdBy: actorId,
      updatedBy: actorId,
    };
    await this.db
      .insert(users)
      .values(row)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: row.name,
          email: row.email,
          phoneE164: row.phoneE164,
          branchId: row.branchId,
          status: row.status,
          mustChangePassword: row.mustChangePassword,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        },
      });

    // Roles: se quitan los que ya no tiene y se agregan los nuevos (las filas de vínculo no se editan).
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, s.id), notInArray(userRoles.roleId, [...s.roleIds])));
    await this.db
      .insert(userRoles)
      .values(
        s.roleIds.map((roleId) => ({
          userId: s.id,
          roleId,
          createdAt: s.updatedAt,
          createdBy: actorId,
        })),
      )
      .onConflictDoNothing();

    // Permisos propios: se reemplazan (un cambio de efecto es borrar y volver a insertar la fila).
    await this.db.delete(userPermissions).where(eq(userPermissions.userId, s.id));
    if (s.permissions.length > 0) {
      await this.db.insert(userPermissions).values(
        s.permissions.map(({ permission, effect }) => ({
          userId: s.id,
          permission,
          effect,
          createdAt: s.updatedAt,
          createdBy: actorId,
        })),
      );
    }
  }

  private async findOneWhere(where: SQL): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(where).limit(1);
    if (!row) return undefined;

    // Pocos roles (el contract los limita) y permisos propios (acotados por el catálogo).
    const [roles, own] = await Promise.all([
      this.db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, row.id))
        .orderBy(asc(userRoles.roleId)),
      this.db
        .select({ permission: userPermissions.permission, effect: userPermissions.effect })
        .from(userPermissions)
        .where(eq(userPermissions.userId, row.id))
        .orderBy(asc(userPermissions.permission)),
    ]);

    return User.restore({
      id: storedValue(parseId<'User'>(row.id)),
      name: row.name,
      email: storedValue(Email.create(row.email)),
      phone: row.phoneE164 === null ? undefined : storedValue(Phone.create(row.phoneE164)),
      status: Status.parse(row.status),
      branchId: row.branchId ?? undefined,
      roleIds: roles.map((r) => r.roleId),
      permissions: own.map(({ permission, effect }) => {
        if (!isKnownPermission(permission)) throw new Error(`Unknown permission: ${permission}`);
        return { permission, effect: Effect.parse(effect) };
      }),
      mustChangePassword: row.mustChangePassword,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
