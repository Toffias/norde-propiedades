import type { RoleListCriteria, RoleListItem, RoleListQuery } from '@norde/core/identity';
import { asc, count, desc, eq, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { roles, userRoles } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

export class DrizzleRoleListQuery implements RoleListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: RoleListCriteria) {
    const where =
      criteria.text === undefined ? undefined : matchesSearchText(roles.searchText, criteria.text);
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
    }));
    return { items, total: totals[0]?.total ?? 0 };
  }
}
