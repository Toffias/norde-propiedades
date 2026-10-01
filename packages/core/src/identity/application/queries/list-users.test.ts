import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import type { RoleListItem, UserListItem } from '../../contracts';
import { StubRoleListQuery, StubUserListQuery, TEST_ADMIN, TEST_AGENT } from '../../testing';
import { ListRoles } from './list-roles';
import { ListUsers } from './list-users';

const ROW: UserListItem = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Camila Pérez',
  email: 'camila@norde.com.ar',
  phone: undefined,
  status: 'active',
  roles: [],
  mustChangePassword: false,
  lastLoginAt: undefined,
  createdAt: new Date('2026-09-01T12:00:00Z'),
};

describe('ListUsers', () => {
  it('asks the query for one page with the filters and returns it', async () => {
    const users = new StubUserListQuery({ items: [ROW], total: 51 });

    const result = await new ListUsers({ users }).execute(
      { page: '3', pageSize: '25', sort: '-lastLoginAt', status: 'suspended', q: 'cami' },
      TEST_ADMIN,
    );

    expect(users.calls).toEqual([
      {
        status: 'suspended',
        text: 'cami',
        sort: { field: 'lastLoginAt', direction: 'desc' },
        offset: 50,
        limit: 25,
      },
    ]);
    expect(result.isOk() && result.value).toEqual({
      items: [ROW],
      total: 51,
      page: 3,
      pageSize: 25,
    });
  });

  it('rejects a page size above the maximum', async () => {
    const users = new StubUserListQuery();

    const result = await new ListUsers({ users }).execute({ pageSize: 1000 }, TEST_ADMIN);

    expect(result.isErr() && result.error.type).toBe('InvalidSearch');
    expect(users.calls).toEqual([]);
  });

  it('needs users:read', async () => {
    const result = await new ListUsers({ users: new StubUserListQuery() }).execute({}, TEST_AGENT);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});

describe('ListRoles', () => {
  const ROLE: RoleListItem = {
    id: '00000000-0000-7000-8000-00000000000a',
    key: 'agent',
    name: 'Agente / Asesor',
    description: undefined,
    isSystem: true,
    userCount: 3,
    deletedAt: undefined,
  };

  it('returns one page of roles', async () => {
    const roles = new StubRoleListQuery({ items: [ROLE], total: 1 });

    const result = await new ListRoles({ roles }).execute({ q: 'agen' }, TEST_ADMIN);

    expect(roles.calls[0]).toEqual({
      view: 'active',
      text: 'agen',
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 25,
    });
    expect(result.isOk() && result.value.items).toEqual([ROLE]);
  });

  it('is allowed to whoever creates or edits users, who has to pick their roles', async () => {
    const roles = new StubRoleListQuery();
    const creator = Actor.user('00000000-0000-7000-8000-0000000000cc', ['users:create']);

    expect((await new ListRoles({ roles }).execute({}, creator)).isOk()).toBe(true);
    const forbidden = await new ListRoles({ roles }).execute({}, TEST_AGENT);
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});
