import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import type { BranchDetail, BranchListItem, TeamListItem } from '../../contracts';
import { MAIN_BRANCH_ID, StubOrganizationQuery, TEST_ADMIN, TEST_AGENT } from '../../testing';
import { GetBranch } from './get-branch';
import { GetTeam } from './get-team';
import { ListBranches } from './list-branches';
import { ListTeams } from './list-teams';

const BRANCH: BranchListItem = {
  id: MAIN_BRANCH_ID,
  name: 'Casa central',
  address: undefined,
  isMain: true,
  userCount: 4,
  deletedAt: undefined,
};

const DETAIL: BranchDetail = {
  id: MAIN_BRANCH_ID,
  name: 'Casa central',
  logoUrl: undefined,
  address: undefined,
  email: undefined,
  phone: undefined,
  whatsapp: undefined,
  isMain: true,
  deletedAt: undefined,
};

const TEAM: TeamListItem = {
  id: '00000000-0000-7000-8000-0000000000c1',
  name: 'Alquileres',
  branch: undefined,
  memberCount: 2,
  deletedAt: undefined,
};

describe('ListBranches', () => {
  it('asks for one page and returns it', async () => {
    const organization = new StubOrganizationQuery({ branches: { items: [BRANCH], total: 1 } });

    const result = await new ListBranches({ organization }).execute({ q: 'casa' }, TEST_ADMIN);

    expect(organization.branchCalls).toEqual([
      {
        view: 'active',
        text: 'casa',
        sort: { field: 'name', direction: 'asc' },
        offset: 0,
        limit: 25,
      },
    ]);
    expect(result.isOk() && result.value.items).toEqual([BRANCH]);
  });

  it('is allowed to whoever edits users, but the trash needs branches:delete', async () => {
    const organization = new StubOrganizationQuery();
    const editor = Actor.user('00000000-0000-7000-8000-0000000000cc', ['users:update']);

    expect((await new ListBranches({ organization }).execute({}, editor)).isOk()).toBe(true);
    const trash = await new ListBranches({ organization }).execute({ view: 'trash' }, editor);
    const agent = await new ListBranches({ organization }).execute({}, TEST_AGENT);

    expect(trash.isErr() && trash.error).toEqual({ type: 'Forbidden' });
    expect(agent.isErr() && agent.error).toEqual({ type: 'Forbidden' });
  });
});

describe('ListTeams', () => {
  it('filters by branch and needs teams:read', async () => {
    const organization = new StubOrganizationQuery({ teams: { items: [TEAM], total: 1 } });

    const result = await new ListTeams({ organization }).execute(
      { branchId: MAIN_BRANCH_ID },
      TEST_ADMIN,
    );
    const forbidden = await new ListTeams({ organization }).execute({}, TEST_AGENT);

    expect(organization.teamCalls[0]).toMatchObject({ branchId: MAIN_BRANCH_ID, view: 'active' });
    expect(result.isOk() && result.value.items).toEqual([TEAM]);
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});

describe('GetBranch and GetTeam', () => {
  it('return the detail or not found', async () => {
    const organization = new StubOrganizationQuery({ branchDetails: [DETAIL] });

    const found = await new GetBranch({ organization }).execute(
      { branchId: MAIN_BRANCH_ID },
      TEST_ADMIN,
    );
    const team = await new GetTeam({ organization }).execute({ teamId: TEAM.id }, TEST_ADMIN);
    const forbidden = await new GetBranch({ organization }).execute(
      { branchId: MAIN_BRANCH_ID },
      TEST_AGENT,
    );

    expect(found.isOk() && found.value).toEqual(DETAIL);
    expect(team.isErr() && team.error).toEqual({ type: 'TeamNotFound' });
    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
  });
});
