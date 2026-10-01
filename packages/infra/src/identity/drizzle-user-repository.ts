import { USER_STATUSES, User, type UserId, type UserRepository } from '@norde/core/identity';
import { Email, parseId, Phone, type Result } from '@norde/core/shared';
import { and, asc, eq, notInArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { userRoles, users } from '../db/schema';

const Status = z.enum(USER_STATUSES);

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
  }

  private async findOneWhere(where: SQL): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(where).limit(1);
    if (!row) return undefined;

    // Un usuario tiene pocos roles (el contract los limita): se traen todos.
    const roles = await this.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, row.id))
      .orderBy(asc(userRoles.roleId));

    return User.restore({
      id: storedValue(parseId<'User'>(row.id)),
      name: row.name,
      email: storedValue(Email.create(row.email)),
      phone: row.phoneE164 === null ? undefined : storedValue(Phone.create(row.phoneE164)),
      status: Status.parse(row.status),
      roleIds: roles.map((r) => r.roleId),
      mustChangePassword: row.mustChangePassword,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
