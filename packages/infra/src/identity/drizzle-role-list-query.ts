import type {
  RoleDetail,
  RoleListCriteria,
  RoleListItem,
  RoleListQuery,
} from '@norde/core/identity';
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { rolePermissions, roles, userRoles } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

export class DrizzleRoleListQuery implements RoleListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: RoleListCriteria) {
    const where = and(
      criteria.view === 'trash' ? isNotNull(roles.deletedAt) : isNull(roles.deletedAt),
      criteria.text === undefined ? undefined : matchesSearchText(roles.searchText, criteria.text),
    );
    const ascending = criteria.sort.direction === 'asc';
    // Usuarios por rol, agrupando `user_roles` por su índice de rol (son decenas de filas).
    const userCount = this.db
      .select({ roleId: userRoles.roleId, total: count().as('total') })
      .from(userRoles)
      .groupBy(userRoles.roleId)
      .as('user_count');

    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: roles.id,
          key: roles.key,
          name: roles.name,
          description: roles.description,
          isSystem: roles.isSystem,
          deletedAt: roles.deletedAt,
          // Un rol sin usuarios no tiene fila en el subquery: el left join trae null.
          userCount: sql<number>`coalesce(${userCount.total}, 0)`.mapWith(Number),
        })
        .from(roles)
        .leftJoin(userCount, eq(userCount.roleId, roles.id))
        .where(where)
        .orderBy(
          ascending ? asc(roles.name) : desc(roles.name),
          ascending ? asc(roles.id) : desc(roles.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(roles).where(where),
    ]);

    const items: RoleListItem[] = rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description ?? undefined,
      isSystem: row.isSystem,
      userCount: row.userCount,
      deletedAt: row.deletedAt ?? undefined,
    }));
    return { items, total: totals[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<RoleDetail | undefined> {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!row) return undefined;

    // Acotados por el catálogo (un centenar como mucho).
    const permissions = await this.db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id))
      .orderBy(asc(rolePermissions.permission));

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description ?? undefined,
      isSystem: row.isSystem,
      permissions: permissions.map((p) => p.permission),
      deletedAt: row.deletedAt ?? undefined,
    };
  }
}
