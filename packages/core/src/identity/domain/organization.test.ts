import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';

import { Branch } from './branch';
import { Team } from './team';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');

function unwrap<T>(result: { isErr(): boolean } & ({ value: T } | { error: unknown })): T {
  if (!('value' in result)) throw new Error('invalid test fixture');
  return result.value;
}

function newBranch(isFirst: boolean) {
  return Branch.create({
    id: unwrap(parseId<'Branch'>('00000000-0000-7000-8000-0000000000b1')),
    name: '  Sucursal Belgrano ',
    logoUrl: undefined,
    address: '  ',
    email: unwrap(Email.create('belgrano@norde.com.ar')),
    phone: undefined,
    whatsapp: undefined,
    isFirst,
    now: NOW,
  });
}

describe('Branch', () => {
  it('is the main branch only when it is the first one', () => {
    expect(newBranch(true).isMain).toBe(true);
    const second = newBranch(false);

    expect(second.isMain).toBe(false);
    expect(second.toSnapshot()).toMatchObject({ name: 'Sucursal Belgrano', address: undefined });
    expect(second.pullEvents().map((e) => e.type)).toEqual(['identity.branch_created']);
  });

  it('never deletes the main branch, nor one with users or teams', () => {
    const main = newBranch(true);
    const other = newBranch(false);

    const deletedMain = main.delete({ userCount: 0, teamCount: 0 }, LATER);
    const withUsers = other.delete({ userCount: 3, teamCount: 0 }, LATER);
    const withTeams = other.delete({ userCount: 0, teamCount: 1 }, LATER);

    expect(deletedMain.isErr() && deletedMain.error).toEqual({ type: 'MainBranchCannotBeDeleted' });
    expect(withUsers.isErr() && withUsers.error).toEqual({
      type: 'BranchHasMembers',
      userCount: 3,
    });
    expect(withTeams.isErr() && withTeams.error).toEqual({ type: 'BranchHasTeams', teamCount: 1 });
    expect(other.isDeleted).toBe(false);
  });

  it('goes to the trash and comes back', () => {
    const branch = newBranch(false);
    branch.pullEvents();

    expect(branch.delete({ userCount: 0, teamCount: 0 }, LATER).isOk()).toBe(true);
    const twice = branch.delete({ userCount: 0, teamCount: 0 }, LATER);
    expect(twice.isErr() && twice.error).toEqual({ type: 'BranchAlreadyDeleted' });
    expect(branch.restoreFromTrash(LATER).isOk()).toBe(true);
    const again = branch.restoreFromTrash(LATER);
    expect(again.isErr() && again.error).toEqual({ type: 'BranchNotDeleted' });
    expect(branch.pullEvents().map((e) => e.type)).toEqual([
      'identity.branch_deleted',
      'identity.branch_restored',
    ]);
  });

  it('becomes the main branch once', () => {
    const branch = newBranch(false);
    branch.pullEvents();

    branch.makeMain(LATER);
    branch.makeMain(LATER);

    expect(branch.isMain).toBe(true);
    expect(branch.pullEvents().map((e) => e.type)).toEqual(['identity.branch_made_main']);
  });
});

describe('Team', () => {
  function newTeam() {
    return Team.create({
      id: unwrap(parseId<'Team'>('00000000-0000-7000-8000-0000000000c1')),
      name: ' Alquileres ',
      branchId: undefined,
      now: NOW,
    });
  }

  it('is created with a clean name', () => {
    const team = newTeam();

    expect(team.name).toBe('Alquileres');
    expect(team.pullEvents().map((e) => e.type)).toEqual(['identity.team_created']);
  });

  it('only changes members while it is not in the trash', () => {
    const team = newTeam();

    expect(team.ensureActive().isOk()).toBe(true);
    team.delete(LATER);
    const active = team.ensureActive();
    expect(active.isErr() && active.error).toEqual({ type: 'TeamDeleted' });

    const twice = team.delete(LATER);
    expect(twice.isErr() && twice.error).toEqual({ type: 'TeamAlreadyDeleted' });
    expect(team.restoreFromTrash(LATER).isOk()).toBe(true);
    const again = team.restoreFromTrash(LATER);
    expect(again.isErr() && again.error).toEqual({ type: 'TeamNotDeleted' });
  });
});
