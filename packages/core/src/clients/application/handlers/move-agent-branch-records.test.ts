import { describe, expect, it } from 'vitest';

import { Actor, USER_BRANCH_CHANGE_BATCH_SIZE } from '../../../shared';
import { FixedClock } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  seedOpportunity,
} from '../../testing';

import { MoveAgentBranchRecords } from './move-agent-branch-records';

const NOW = new Date('2026-11-14T12:00:00Z');
const NEW_BRANCH_ID = '00000000-0000-7000-8000-0000000000b9';
const scheduler = Actor.system('scheduler', ['clients:move-user-branch']);
const INPUT = { userId: AGENT_ID, fromBranchId: BRANCH_ID, toBranchId: NEW_BRANCH_ID };

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const handler = new MoveAgentBranchRecords({ uow, clock: new FixedClock(NOW) });
  return { uow, handler };
}

describe('MoveAgentBranchRecords', () => {
  it('moves the agent contacts and opportunities still in the old branch, auditing each', async () => {
    const { uow, handler } = setup();
    const mine = await seedClient(uow, { agentId: AGENT_ID, branchId: BRANCH_ID });
    const trashed = await seedClient(uow, {
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
      deleted: true,
    });
    const elsewhere = await seedClient(uow, { agentId: AGENT_ID, branchId: OTHER_BRANCH_ID });
    const someoneElse = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: BRANCH_ID });
    const opportunity = await seedOpportunity(uow, mine, {
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    uow.audit.entries.splice(0);

    const result = await handler.execute(INPUT, scheduler);

    expect(result.isOk() && result.value).toEqual({ clients: 2, opportunities: 1 });
    const branchOf = (id: string) => uow.clients.rows.get(id)?.branchId;
    expect(branchOf(mine.id)).toBe(NEW_BRANCH_ID);
    expect(branchOf(trashed.id)).toBe(NEW_BRANCH_ID);
    expect(branchOf(elsewhere.id)).toBe(OTHER_BRANCH_ID);
    expect(branchOf(someoneElse.id)).toBe(BRANCH_ID);
    expect(uow.opportunities.rows.get(opportunity.id)?.branchId).toBe(NEW_BRANCH_ID);
    expect(uow.audit.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'client.branch_changed',
          entityType: 'client',
          entityId: mine.id,
          clientIds: [mine.id],
          changes: { branchId: { before: BRANCH_ID, after: NEW_BRANCH_ID } },
        }),
        expect.objectContaining({
          action: 'opportunity.branch_changed',
          entityType: 'opportunity',
          entityId: opportunity.id,
          clientIds: [mine.id],
        }),
      ]),
    );
    expect(uow.audit.entries).toHaveLength(3);
  });

  it('goes through every batch and does nothing the second time', async () => {
    const { uow, handler } = setup();
    for (let i = 0; i <= USER_BRANCH_CHANGE_BATCH_SIZE; i += 1) {
      await seedClient(uow, { agentId: AGENT_ID, branchId: BRANCH_ID });
    }

    const first = await handler.execute(INPUT, scheduler);
    const second = await handler.execute(INPUT, scheduler);

    expect(first.isOk() && first.value.clients).toBe(USER_BRANCH_CHANGE_BATCH_SIZE + 1);
    expect(second.isOk() && second.value).toEqual({ clients: 0, opportunities: 0 });
  });

  it('needs its permission and a valid change', async () => {
    const { handler } = setup();

    const forbidden = await handler.execute(INPUT, Actor.system('scheduler', ['clients:read']));
    const same = await handler.execute({ ...INPUT, toBranchId: BRANCH_ID }, scheduler);

    expect(forbidden.isErr() && forbidden.error).toEqual({ type: 'Forbidden' });
    expect(same.isErr() && same.error).toEqual({ type: 'InvalidInput' });
  });
});
