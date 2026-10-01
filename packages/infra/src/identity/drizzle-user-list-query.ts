import {
  USER_STATUSES,
  type UserListCriteria,
  type UserListItem,
  type UserListQuery,
  type UserRole,
  type UserSortField,
} from '@norde/core/identity';
import { and, asc, count, desc, eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { roles, userRoles, users } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

const Status = z.enum(USER_STATUSES);

const SORT_COLUMNS: Readonly<Record<UserSortField, AnyColumn>> = {
  name: users.name,
  email: users.email,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

function orderBy({ field, direction }: UserListCriteria['sort']): SQL[] {
  const column = SORT_COLUMNS[field];
  // Los que nunca ingresaron van al final, en los dos sentidos.
  const primary =
    direction === 'asc' ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
  // Desempate por ID: el orden es estable entre páginas (no se pierden ni repiten filas).
  return [primary, direction === 'asc' ? asc(users.id) : desc(users.id)];
}

export class DrizzleUserListQuery implements UserListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: UserListCriteria) {
    const where = and(
      eq(users.status, criteria.status),
      criteria.text === undefined ? undefined : matchesSearchText(users.searchText, criteria.text),
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phoneE164: users.phoneE164,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(...orderBy(criteria.sort))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(users).where(where),
    ]);

    const rolesByUser = await this.rolesOf(rows.map((row) => row.id));
    const items: UserListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phoneE164 ?? undefined,
      status: Status.parse(row.status),
      roles: rolesByUser.get(row.id) ?? [],
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: row.lastLoginAt ?? undefined,
      createdAt: row.createdAt,
    }));
    return { items, total: totals[0]?.total ?? 0 };
  }

  /** Roles de los usuarios de la página (como mucho una página de usuarios). */
  private async rolesOf(userIds: readonly string[]): Promise<Map<string, UserRole[]>> {
    const byUser = new Map<string, UserRole[]>();
    if (userIds.length === 0) return byUser;

    const rows = await this.db
      .select({ userId: userRoles.userId, id: roles.id, key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, [...userIds]))
      .orderBy(asc(roles.name));
    for (const { userId, ...role } of rows) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), role]);
    }
    return byUser;
  }
}
