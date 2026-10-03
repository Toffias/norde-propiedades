import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  closeReasonFixtureId,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  seedOpportunity,
  stageFixtureId,
  StubOpportunityPipelineQuery,
} from '../../testing';
import { NO_RULES, type OpportunityRules } from '../../domain/opportunity-settings';
import type { OpportunityRequesters } from '../ports/opportunity-requesters';
import { ApplyOpportunityRules } from '../handlers/apply-opportunity-rules';
import { RunOpportunityBulkOperation } from '../handlers/run-opportunity-bulk-operation';
import { GetOpportunityBulkOperation } from '../queries/get-opportunity-bulk-operation';

import { BulkUpdateOpportunities } from './bulk-update-opportunities';
import { UpdateOpportunityReferral } from './update-opportunity-referral';

const NEW = stageFixtureId(0);
const CONTACTED = stageFixtureId(1);
const VISITING = stageFixtureId(2);
const NEGOTIATING = stageFixtureId(3);
const LOST = stageFixtureId(5);
const NEGATIVE = closeReasonFixtureId(1);

/** Agente: mueve las suyas. */
const AGENT = Actor.user(AGENT_ID, ['opportunities:read', 'opportunities:update']).withBranch(
  BRANCH_ID,
);
/** Gerente: todo sobre oportunidades. */
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000c3', ['opportunities:*']);
const JOBS = Actor.system('scheduler', ['opportunities:run-bulk', 'opportunities:apply-rules']);

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const pipeline = new StubOpportunityPipelineQuery();
  const agents = new InMemoryClientAgents();
  const bulk = new BulkUpdateOpportunities({ uow, pipeline, agents, ids, clock });
  return { uow, clock, ids, pipeline, agents, bulk };
}

describe('BulkUpdateOpportunities', () => {
  it('changes the stage of the marked ones and skips what cannot change, with audit', async () => {
    const { uow, bulk } = setup();
    const client = await seedClient(uow);
    const mine = await seedOpportunity(uow, client);
    const atVisiting = await seedOpportunity(uow, client, { stageIndex: 2 });
    const others = await seedOpportunity(uow, client, {
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const closed = await seedOpportunity(uow, client, { stageIndex: 5 });

    const output = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'ids', ids: [mine.id, atVisiting.id, others.id, closed.id] },
          action: { kind: 'change_stage', stageId: NEGOTIATING },
        },
        AGENT,
      ),
    );

    // Desde "nuevo" no se negocia; desde "visitando", sí.
    expect(output).toEqual({
      mode: 'done',
      result: {
        total: 4,
        processed: 4,
        updated: 1,
        unchanged: 0,
        skippedCount: 3,
        skipped: [
          { opportunityId: mine.id, reason: 'invalid_transition' },
          { opportunityId: others.id, reason: 'not_found' },
          { opportunityId: closed.id, reason: 'closed' },
        ],
      },
    });
    expect(uow.opportunities.rows.get(atVisiting.id)?.stageId).toBe(NEGOTIATING);
    expect(uow.audit.entries.map((e) => [e.action, e.entityId])).toEqual([
      ['opportunity.status_changed', atVisiting.id],
    ]);
  });

  it('skips the visible ones the actor cannot change', async () => {
    const { uow, bulk } = setup();
    const client = await seedClient(uow);
    const others = await seedOpportunity(uow, client, {
      agentId: OTHER_AGENT_ID,
      branchId: BRANCH_ID,
    });
    const branchViewer = Actor.user(AGENT_ID, [
      'opportunities:read-branch',
      'opportunities:update',
    ]).withBranch(BRANCH_ID);

    const output = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'ids', ids: [others.id] },
          action: { kind: 'change_stage', stageId: CONTACTED },
        },
        branchViewer,
      ),
    );

    expect(output.mode === 'done' && output.result.skipped).toEqual([
      { opportunityId: others.id, reason: 'forbidden' },
    ]);
  });

  it('runs the ones that match the filter in the request, by key, up to the sync limit', async () => {
    const { uow, pipeline, bulk } = setup();
    const client = await seedClient(uow);
    const opportunities = [];
    for (let i = 0; i < 3; i++) opportunities.push(await seedOpportunity(uow, client));
    pipeline.matching = opportunities.map((o) => o.id);

    const output = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'filter', filter: { stageId: NEW, originChannel: 'whatsapp' } },
          action: { kind: 'close', closeReasonId: NEGATIVE },
        },
        MANAGER,
      ),
    );

    expect(output.mode === 'done' && output.result.updated).toBe(3);
    expect(pipeline.bulkCriteria[0]).toMatchObject({
      stageId: NEW,
      originChannel: 'whatsapp',
      visibility: { kind: 'all' },
    });
    for (const o of opportunities) {
      expect(uow.opportunities.rows.get(o.id)).toMatchObject({ status: 'lost', stageId: LOST });
    }
  });

  it('queues more than the sync limit as a job, with its event and audit', async () => {
    const { uow, pipeline, bulk } = setup();
    pipeline.matching = Array.from(
      { length: 150 },
      (_, i) => `00000000-0000-7000-8000-a${i.toString().padStart(11, '0')}`,
    );

    const output = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'filter', filter: { category: 'new' } },
          action: { kind: 'reassign', agentId: OTHER_AGENT_ID },
        },
        MANAGER,
      ),
    );

    expect(output).toMatchObject({ mode: 'queued', total: 150 });
    const operation = [...uow.bulkOperations.rows.values()][0];
    expect(operation).toMatchObject({
      status: 'pending',
      requestedBy: MANAGER.id,
      action: { kind: 'reassign', agentId: OTHER_AGENT_ID },
      selection: { kind: 'filter', filter: { category: 'new' } },
      totals: { total: 150, processed: 0 },
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.opportunity_bulk_requested']);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.bulk_requested',
      changes: { action: { after: 'reassign' }, total: { after: 150 } },
    });
  });

  it('rejects too many, a missing permission and an action that cannot apply', async () => {
    const { pipeline, bulk } = setup();
    pipeline.matching = Array.from(
      { length: 2001 },
      (_, i) => `00000000-0000-7000-8000-a${i.toString().padStart(11, '0')}`,
    );
    const filter = { kind: 'filter' as const, filter: {} };

    expect(
      unwrapErr(
        await bulk.execute(
          { selection: filter, action: { kind: 'close', closeReasonId: NEGATIVE } },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'TooManyOpportunities', max: 2000, total: 2001 });
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: filter, action: { kind: 'reassign', agentId: null } },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: filter, action: { kind: 'change_stage', stageId: LOST } },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'CloseRequiresReason' });
    expect(
      unwrapErr(
        await bulk.execute(
          {
            selection: filter,
            action: { kind: 'reassign', agentId: '00000000-0000-7000-8000-0000000000ee' },
          },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'AgentNotFound' });
  });
});

describe('RunOpportunityBulkOperation', () => {
  async function queued(count: number) {
    const base = setup();
    const client = await seedClient(base.uow);
    const opportunities = [];
    for (let i = 0; i < count; i++) opportunities.push(await seedOpportunity(base.uow, client));
    base.pipeline.matching = opportunities.map((o) => o.id);
    const output = unwrap(
      await base.bulk.execute(
        {
          selection: { kind: 'filter', filter: { stageId: NEW } },
          action: { kind: 'change_stage', stageId: CONTACTED },
        },
        MANAGER,
      ),
    );
    if (output.mode !== 'queued') throw new Error('expected a job');
    let requester: Actor | undefined = MANAGER;
    const requesters: OpportunityRequesters = {
      actorFor: (userId) => Promise.resolve(userId === MANAGER.id ? requester : undefined),
    };
    const run = new RunOpportunityBulkOperation({ ...base, requesters });
    return {
      ...base,
      opportunities,
      operationId: output.operationId,
      run,
      revoke: () => {
        requester = undefined;
      },
    };
  }

  it('processes it in batches as the requester, and does nothing once finished', async () => {
    const { uow, opportunities, operationId, run } = await queued(130);

    expect(unwrap(await run.execute({ operationId }, JOBS))).toEqual({ status: 'done' });

    const operation = uow.bulkOperations.rows.get(operationId);
    expect(operation).toMatchObject({
      status: 'done',
      totals: { total: 130, processed: 130, updated: 130, skippedCount: 0 },
      cursor: opportunities.at(-1)?.id,
    });
    expect(
      opportunities.every((o) => uow.opportunities.rows.get(o.id)?.stageId === CONTACTED),
    ).toBe(true);
    // Lo audita como quien la pidió, agrupado por la operación.
    const changes = uow.audit.entries.filter((e) => e.action === 'opportunity.status_changed');
    expect(changes).toHaveLength(130);
    expect(changes.every((e) => e.actorId === MANAGER.id && e.correlationId === operationId)).toBe(
      true,
    );

    const audits = uow.audit.entries.length;
    expect(unwrap(await run.execute({ operationId }, JOBS))).toEqual({ status: 'done' });
    expect(uow.audit.entries).toHaveLength(audits);
  });

  it('fails when the requester is no longer active', async () => {
    const { uow, operationId, run, revoke } = await queued(101);
    revoke();

    expect(unwrap(await run.execute({ operationId }, JOBS))).toEqual({ status: 'failed' });
    expect(uow.bulkOperations.rows.get(operationId)).toMatchObject({
      status: 'failed',
      failure: 'requester_unavailable',
    });
  });

  it('only runs for the jobs actor, and is followed only by its requester', async () => {
    const { uow, operationId, run } = await queued(101);
    const get = new GetOpportunityBulkOperation({ uow });

    expect(unwrapErr(await run.execute({ operationId }, MANAGER))).toEqual({ type: 'Forbidden' });
    expect(unwrap(await get.execute({ operationId }, MANAGER))).toMatchObject({
      id: operationId,
      status: 'pending',
      result: { total: 101, processed: 0 },
    });
    expect(unwrapErr(await get.execute({ operationId }, AGENT))).toEqual({
      type: 'BulkOperationNotFound',
    });
  });
});

describe('ApplyOpportunityRules', () => {
  function rulesSetup(rules: Partial<OpportunityRules>) {
    const base = setup();
    base.uow.opportunitySettings.rules = { ...NO_RULES, ...rules };
    const apply = new ApplyOpportunityRules(base);
    return { ...base, apply };
  }

  it('moves an assigned opportunity once per event, as the system', async () => {
    const { uow, apply } = rulesSetup({ onAssign: CONTACTED });
    const client = await seedClient(uow);
    const opportunity = await seedOpportunity(uow, client);
    const event = {
      eventId: '00000000-0000-7000-8000-0000000000e9',
      opportunityId: opportunity.id,
      trigger: { kind: 'assigned' as const, toAgentId: OTHER_AGENT_ID },
    };

    expect(unwrap(await apply.execute(event, JOBS))).toEqual({ applied: true, rule: 'onAssign' });
    expect(unwrap(await apply.execute(event, JOBS))).toEqual({
      applied: false,
      reason: 'already_applied',
    });
    expect(uow.opportunities.rows.get(opportunity.id)?.stageId).toBe(CONTACTED);
    expect(uow.opportunities.statusChanges).toMatchObject([
      { toStageId: CONTACTED, sourceEventId: event.eventId, changedBy: 'system:scheduler' },
    ]);
    expect(uow.activities.of(client.id)).toMatchObject([
      { actorId: 'system:scheduler', body: { kind: 'status_change', toStageId: CONTACTED } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.status_changed',
      actorId: 'system:scheduler',
    });
  });

  it('does nothing when it is left without agent, has no rule or the domain does not allow it', async () => {
    const { uow, apply } = rulesSetup({ onAssign: NEGOTIATING });
    const client = await seedClient(uow);
    const opportunity = await seedOpportunity(uow, client);
    const event = (n: number, toAgentId: string | undefined) => ({
      eventId: `00000000-0000-7000-8000-00000000e00${String(n)}`,
      opportunityId: opportunity.id,
      trigger: { kind: 'assigned' as const, toAgentId },
    });

    expect(unwrap(await apply.execute(event(1, undefined), JOBS))).toEqual({
      applied: false,
      reason: 'no_rule',
    });
    // De "nuevo" no se pasa a "negociando".
    expect(unwrap(await apply.execute(event(2, AGENT_ID), JOBS))).toEqual({
      applied: false,
      reason: 'not_allowed',
    });
    expect(
      unwrap(
        await apply.execute({ ...event(3, AGENT_ID), trigger: { kind: 'request_added' } }, JOBS),
      ),
    ).toEqual({ applied: false, reason: 'no_rule' });
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('reactivates a referred opportunity and moves the ones of owners', async () => {
    const { uow, apply } = rulesSetup({ onReactivate: NEW, forOwners: VISITING });
    const buyer = await seedClient(uow);
    const owner = await seedClient(uow, { clientTypes: ['owner_seller'] });
    const referred = await seedOpportunity(uow, buyer, { stageIndex: 6 });
    const ownerOpportunity = await seedOpportunity(uow, owner);
    const buyerOpportunity = await seedOpportunity(uow, buyer);

    expect(
      unwrap(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000e1',
            opportunityId: referred.id,
            trigger: { kind: 'request_added' },
          },
          JOBS,
        ),
      ),
    ).toEqual({ applied: true, rule: 'onReactivate' });
    expect(
      unwrap(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000e2',
            opportunityId: ownerOpportunity.id,
            trigger: { kind: 'created' },
          },
          JOBS,
        ),
      ),
    ).toEqual({ applied: true, rule: 'forOwners' });
    expect(
      unwrap(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000e3',
            opportunityId: buyerOpportunity.id,
            trigger: { kind: 'created' },
          },
          JOBS,
        ),
      ),
    ).toEqual({ applied: false, reason: 'no_rule' });
    expect(uow.opportunities.rows.get(referred.id)?.stageId).toBe(NEW);
    expect(uow.opportunities.rows.get(ownerOpportunity.id)?.stageId).toBe(VISITING);
  });

  it('reactivates a referred opportunity when listings are featured, once per event', async () => {
    const { uow, apply } = rulesSetup({ onReactivate: NEW });
    const client = await seedClient(uow);
    const referred = await seedOpportunity(uow, client, { stageIndex: 6 });
    const event = {
      eventId: '00000000-0000-7000-8000-0000000000e4',
      opportunityId: referred.id,
      trigger: { kind: 'listings_featured' as const },
    };

    expect(unwrap(await apply.execute(event, JOBS))).toEqual({
      applied: true,
      rule: 'onReactivate',
    });
    expect(unwrap(await apply.execute(event, JOBS))).toEqual({
      applied: false,
      reason: 'already_applied',
    });
    expect(uow.opportunities.rows.get(referred.id)?.stageId).toBe(NEW);
  });

  it('only runs for the system actor with the rules permission', async () => {
    const { apply } = rulesSetup({});
    expect(
      unwrapErr(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000e1',
            opportunityId: '00000000-0000-7000-8000-0000000000e2',
            trigger: { kind: 'request_added' },
          },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('UpdateOpportunityReferral', () => {
  it('records the partner of a referred opportunity, with audit', async () => {
    const { uow, clock } = setup();
    const client = await seedClient(uow);
    const opportunity = await seedOpportunity(uow, client, { stageIndex: 6 });
    const useCase = new UpdateOpportunityReferral({ uow, clock });

    unwrap(
      await useCase.execute(
        {
          opportunityId: opportunity.id,
          partnerName: '  Inmobiliaria Sur ',
          referredAt: '2026-02-20',
          result: 'referred',
        },
        AGENT,
      ),
    );

    expect(uow.opportunities.rows.get(opportunity.id)?.referral).toEqual({
      partnerName: 'Inmobiliaria Sur',
      referredAt: new Date('2026-02-20T03:00:00Z'),
      result: 'referred',
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.referral_updated',
      entityId: opportunity.id,
      changes: {
        partnerName: { before: null, after: 'Inmobiliaria Sur' },
        referredAt: { before: null, after: '2026-02-20' },
        referralResult: { before: null, after: 'referred' },
      },
    });
  });

  it('rejects one that is not referred, or of another agent', async () => {
    const { uow, clock } = setup();
    const client = await seedClient(uow);
    const open = await seedOpportunity(uow, client);
    const others = await seedOpportunity(uow, client, {
      stageIndex: 6,
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const useCase = new UpdateOpportunityReferral({ uow, clock });
    const data = { partnerName: 'Sur', referredAt: null, result: null };

    expect(unwrapErr(await useCase.execute({ opportunityId: open.id, ...data }, AGENT))).toEqual({
      type: 'OpportunityNotReferred',
    });
    expect(unwrapErr(await useCase.execute({ opportunityId: others.id, ...data }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});
