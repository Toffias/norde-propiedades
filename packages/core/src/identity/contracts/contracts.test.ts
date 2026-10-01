import { describe, expect, it } from 'vitest';

import { USER_STATUSES } from '../domain/access';

import {
  CreateUserInputSchema,
  ListUsersQuerySchema,
  MIN_PASSWORD_LENGTH,
  USER_STATUS_VALUES,
} from './index';

describe('identity contracts', () => {
  it('replicate the user statuses of the domain', () => {
    expect(USER_STATUS_VALUES).toEqual(USER_STATUSES);
  });

  it('list active users by name by default', () => {
    expect(ListUsersQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: { field: 'name', direction: 'asc' },
      status: 'active',
    });
  });

  it('only sort by the whitelisted columns', () => {
    expect(ListUsersQuerySchema.safeParse({ sort: 'passwordHash' }).success).toBe(false);
    expect(ListUsersQuerySchema.parse({ sort: '-lastLoginAt' }).sort).toEqual({
      field: 'lastLoginAt',
      direction: 'desc',
    });
  });

  it('ask for a temporary password as long as the sign-in requires', () => {
    const input = {
      name: 'Camila',
      email: 'Camila@Norde.com.ar ',
      roleIds: ['00000000-0000-7000-8000-00000000000a'],
      temporaryPassword: 'x'.repeat(MIN_PASSWORD_LENGTH - 1),
    };

    expect(CreateUserInputSchema.safeParse(input).success).toBe(false);
    const parsed = CreateUserInputSchema.parse({
      ...input,
      temporaryPassword: 'x'.repeat(MIN_PASSWORD_LENGTH),
    });
    expect(parsed.email).toBe('camila@norde.com.ar');
  });
});
