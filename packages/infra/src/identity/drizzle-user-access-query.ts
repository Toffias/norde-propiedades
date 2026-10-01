import {
  PERMISSION_EFFECTS,
  USER_STATUSES,
  isPermissionClaim,
  type PermissionClaim,
  type UserAccessQuery,
  type UserAccessRecord,
} from '@norde/core/identity';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { rolePermissions, roles, userPermissions, userRoles, users } from '../db/schema';

// Columnas `text` de la base → tipos del core. Un valor fuera de catálogo falla fuerte en lugar
// de propagar un tipo mentiroso (o, peor, un permiso mal escrito que nadie usa).
const Status = z.enum(USER_STATUSES);
const Effect = z.enum(PERMISSION_EFFECTS);

function toPermission(raw: string): PermissionClaim {
  if (!isPermissionClaim(raw)) throw new Error(`Invalid permission in the database: ${raw}`);
  return raw;
}

export class DrizzleUserAccessQuery implements UserAccessQuery {
  constructor(private readonly db: DbExecutor) {}

  async findByUserId(userId: string): Promise<UserAccessRecord | undefined> {
    const [user] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return undefined;

    // Un usuario tiene pocos roles y permisos (decenas): se traen todos, sin paginar.
    const [roleRows, rolePermissionRows, ownRows] = await Promise.all([
      this.db
        .select({ key: roles.key, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, userId))
        .orderBy(asc(roles.name)),
      this.db
        .select({ permission: rolePermissions.permission })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .where(eq(userRoles.userId, userId)),
      this.db
        .select({ permission: userPermissions.permission, effect: userPermissions.effect })
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId)),
    ]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: Status.parse(user.status),
      roles: roleRows,
      rolePermissions: rolePermissionRows.map((row) => toPermission(row.permission)),
      userPermissions: ownRows.map((row) => ({
        permission: toPermission(row.permission),
        effect: Effect.parse(row.effect),
      })),
    };
  }
}
