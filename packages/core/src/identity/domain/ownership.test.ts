import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared/application/actor';

import {
  accessScope,
  canActOn,
  OWNERSHIP_RULES,
  visibilityFilter,
  type OwnershipRule,
} from './ownership';
import { isKnownPermission } from './permission-catalog';

const PALERMO = 'branch-palermo';
const BELGRANO = 'branch-belgrano';
const READ = OWNERSHIP_RULES.clientsRead;

function user(
  permissions: readonly `${string}:${string}`[],
  branchId: string | undefined = PALERMO,
) {
  return Actor.user('camila', permissions).withBranch(branchId);
}

const OWN = { ownerId: 'camila', ownerBranchId: PALERMO };
const SAME_BRANCH = { ownerId: 'bruno', ownerBranchId: PALERMO };
const OTHER_BRANCH = { ownerId: 'dolores', ownerBranchId: BELGRANO };
const UNASSIGNED = { ownerId: undefined, ownerBranchId: undefined };

describe('accessScope', () => {
  it('gives the widest scope the permissions cover', () => {
    expect(accessScope(user(['clients:read']), READ)).toBe('own');
    expect(accessScope(user(['clients:read', 'clients:read-branch']), READ)).toBe('branch');
    expect(accessScope(user(['clients:read-all']), READ)).toBe('all');
    expect(accessScope(user(['clients:*']), READ)).toBe('all');
    expect(accessScope(user(['properties:read']), READ)).toBeUndefined();
  });

  it('keeps a user without a branch in their own records', () => {
    const withoutBranch = Actor.user('camila', ['clients:read', 'clients:read-branch']);

    expect(accessScope(withoutBranch, READ)).toBe('own');
  });

  it('lets a deny cut the wider scope', () => {
    const agent = Actor.user('camila', ['clients:*'], ['clients:read-all']).withBranch(PALERMO);

    expect(accessScope(agent, READ)).toBe('branch');
  });

  it('gives a system actor everything with the action permission, and nothing without it', () => {
    expect(accessScope(Actor.system('agent-ia', ['clients:read']), READ)).toBe('all');
    expect(accessScope(Actor.system('agent-ia', []), READ)).toBeUndefined();
  });
});

describe('canActOn', () => {
  it('limits the own scope to the records of the user', () => {
    const agent = user(['clients:read']);

    expect(canActOn(agent, READ, OWN)).toBe(true);
    expect(canActOn(agent, READ, SAME_BRANCH)).toBe(false);
    expect(canActOn(agent, READ, UNASSIGNED)).toBe(false);
  });

  it('adds the records of the same branch with the branch scope', () => {
    const agent = user(['clients:read-branch']);

    expect(canActOn(agent, READ, OWN)).toBe(true);
    expect(canActOn(agent, READ, SAME_BRANCH)).toBe(true);
    expect(canActOn(agent, READ, OTHER_BRANCH)).toBe(false);
    expect(canActOn(agent, READ, UNASSIGNED)).toBe(false);
  });

  it('reaches everything, also unassigned records, with the all scope', () => {
    const manager = user(['clients:read-all']);

    expect(canActOn(manager, READ, OTHER_BRANCH)).toBe(true);
    expect(canActOn(manager, READ, UNASSIGNED)).toBe(true);
  });

  it('needs the "others" permission to delete what belongs to someone else', () => {
    const agent = user(['clients:delete']);
    const manager = user(['clients:delete', 'clients:delete-others']);

    expect(canActOn(agent, OWNERSHIP_RULES.clientsDelete, OWN)).toBe(true);
    expect(canActOn(agent, OWNERSHIP_RULES.clientsDelete, SAME_BRANCH)).toBe(false);
    expect(canActOn(manager, OWNERSHIP_RULES.clientsDelete, OTHER_BRANCH)).toBe(true);
  });

  it('denies everything without the action permission', () => {
    expect(canActOn(user([]), READ, OWN)).toBe(false);
  });
});

describe('visibilityFilter', () => {
  it('turns the scope into a filter for the listing query', () => {
    expect(visibilityFilter(user(['clients:read-all']), READ)).toEqual({ kind: 'all' });
    expect(visibilityFilter(user(['clients:read-branch']), READ)).toEqual({
      kind: 'branch',
      ownerId: 'camila',
      branchId: PALERMO,
    });
    expect(visibilityFilter(user(['clients:read']), READ)).toEqual({
      kind: 'own',
      ownerId: 'camila',
    });
    expect(visibilityFilter(user([]), READ)).toEqual({ kind: 'none' });
  });
});

describe('OWNERSHIP_RULES', () => {
  it('only use permissions of the catalog', () => {
    const rules: readonly OwnershipRule[] = Object.values(OWNERSHIP_RULES);
    const permissions = rules.flatMap((rule) =>
      [rule.own, rule.branch, rule.all].filter((p) => p !== undefined),
    );

    expect(permissions.filter((permission) => !isKnownPermission(permission))).toEqual([]);
  });
});
