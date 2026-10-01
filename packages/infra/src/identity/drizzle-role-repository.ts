import {
  isKnownPermission,
  Role,
  type PermissionClaim,
  type RoleId,
  type RoleRepository,
} from '@norde/core/identity';
import { parseId } from '@norde/core/shared';
import { and, asc, count, eq, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { rolePermissions, roles, userRoles } from '../db/schema';

function toPermission(raw: string): PermissionClaim {
  if (!isKnownPermission(raw)) throw new Error(`Unknown permission in the database: ${raw}`);
  return raw;
}

export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: RoleId) {
    return this.findOneWhere(eq(roles.id, id));
  }

  findByKey(key: string) {
    return this.findOneWhere(eq(roles.key, key));
  }

  findByName(name: string) {
    // Misma normalización que la columna `search_text` (minúsculas, sin acentos).
    return this.findOneWhere(sql`${roles.searchText} = core.search_normalize(${name.trim()})`);
  }

  async findExistingIds(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(inArray(roles.id, [...ids]), isNull(roles.deletedAt)));
    return rows.map((row) => row.id);
  }

  async countUsers(id: RoleId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(userRoles)
      .where(eq(userRoles.roleId, id));
    return row?.total ?? 0;
  }

  async save(role: Role, actorId: string): Promise<void> {
    const s = role.toSnapshot();
    const row = {
      id: s.id,
      key: s.key,
      name: s.name,
      description: s.description ?? null,
      isSystem: s.isSystem,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedAt === undefined ? null : actorId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      createdBy: actorId,
      updatedBy: actorId,
    };
    await this.db
      .insert(roles)
      .values(row)
      .onConflictDoUpdate({
        target: roles.id,
        set: {
          name: row.name,
          description: row.description,
          deletedAt: row.deletedAt,
          deletedBy: row.deletedBy,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        },
      });

    // Permisos: filas de vínculo, se quitan las que ya no están y se agregan las nuevas.
    await this.db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, s.id),
          s.permissions.length === 0
            ? undefined
            : notInArray(rolePermissions.permission, [...s.permissions]),
        ),
      );
    if (s.permissions.length > 0) {
      await this.db
        .insert(rolePermissions)
        .values(
          s.permissions.map((permission) => ({
            roleId: s.id,
            permission,
            createdAt: s.updatedAt,
            createdBy: actorId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  private async findOneWhere(where: SQL): Promise<Role | undefined> {
    const [row] = await this.db.select().from(roles).where(where).limit(1);
    if (!row) return undefined;

    // Acotados por el catálogo (un centenar como mucho).
    const permissions = await this.db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, row.id))
      .orderBy(asc(rolePermissions.permission));

    const id = parseId<'Role'>(row.id);
    if (id.isErr()) throw new Error(`Invalid role id in the database: ${row.id}`);
    return Role.restore({
      id: id.value,
      key: row.key,
      name: row.name,
      description: row.description ?? undefined,
      isSystem: row.isSystem,
      permissions: permissions.map((p) => toPermission(p.permission)),
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
