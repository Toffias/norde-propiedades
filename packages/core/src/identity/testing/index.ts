// Fakes del módulo identity para tests (`@norde/core/identity/testing`).

import type { UserAccessQuery, UserAccessRecord } from '../application/ports/user-access-query';

export class InMemoryUserAccessQuery implements UserAccessQuery {
  readonly rows = new Map<string, UserAccessRecord>();

  constructor(users: readonly UserAccessRecord[] = []) {
    for (const user of users) this.rows.set(user.id, user);
  }

  findByUserId(userId: string) {
    return Promise.resolve(this.rows.get(userId));
  }
}
