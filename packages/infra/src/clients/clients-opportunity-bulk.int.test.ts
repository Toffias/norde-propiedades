import {
  ApplyOpportunityRules,
  BulkUpdateOpportunities,
  RunOpportunityBulkOperation,
  UpdateOpportunityReferral,
  type OpportunityBulkCriteria,
} from '@norde/core/clients';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { and, eq, isNotNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { SEEDED_STAGES, useTestDatabase } from '../../test/database';
import {
  auditLog,
  clients,
  opportunities,
  opportunityBulkOperations,
  opportunityStatusChanges,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleOpportunityPipelineQuery } from './drizzle-opportunity-pipeline-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const pipeline = new DrizzleOpportunityPipelineQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const CLIENT = '00000000-0000-7000-8000-0000000000c1';
const NOW = new Date('2026-02-01T10:00:00Z');
const TOTAL = 150;
const authored = { createdBy: 'system:import', updatedBy: 'system:import' };

const manager = Actor.user(AGENT, ['opportunities:*']).withBranch(BRANCH);
const jobs = Actor.system('scheduler', ['opportunities:run-bulk', 'opportunities:apply-rules']);
const agents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: () => Promise.resolve({ branchId: BRANCH }),
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const opportunityId = (i: number) =>
  `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`;

/** Un contacto con 150 oportunidades nuevas y una derivada a socia. */
async function seed(): Promise<void> {
  await db.insert(clients).values({
    id: CLIENT,
    name: 'Ana Pérez',
    kind: 'person',
    clientTypes: [],
    agentId: AGENT,
    branchId: BRANCH,
    createdAt: NOW,
    updatedAt: NOW,
    ...authored,
  });
  await db.insert(opportunities).values(
    Array.from({ length: TOTAL + 1 }, (_, i) => {
      const referred = i === TOTAL;
      return {
        id: opportunityId(i),
        clientId: CLIENT,
        originChannel: 'whatsapp',
        type: 'sale',
        intent: 'info',
        status: referred ? 'referred_to_partner' : 'new',
        stageId: referred ? SEEDED_STAGES.referred_to_partner : SEEDED_STAGES.new,
        agentId: AGENT,
        branchId: BRANCH,
        statusChangedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
        ...authored,
      };
    }),
  );
}

const NEW_SECTION: OpportunityBulkCriteria = {
  visibility: { kind: 'all' },
  text: undefined,
  agentId: undefined,
  branchId: undefined,
  tagId: undefined,
  originChannel: undefined,
  category: undefined,
  created: { from: undefined, to: undefined },
  updated: { from: undefined, to: undefined },
  stageId: SEEDED_STAGES.new,
};

describe('opportunity bulk actions', () => {
  it('counts and walks the selection by key, without losing or repeating rows', async () => {
    await seed();

    expect(await pipeline.count(NEW_SECTION)).toBe(TOTAL);
    expect(await pipeline.count({ ...NEW_SECTION, stageId: undefined })).toBe(TOTAL + 1);
    const seen: string[] = [];
    let afterId: string | undefined;
    for (;;) {
      const page = await pipeline.matchingIds(NEW_SECTION, { afterId, limit: 40 });
      if (page.length === 0) break;
      seen.push(...page);
      afterId = page.at(-1);
    }
    expect(seen).toHaveLength(TOTAL);
    expect(new Set(seen).size).toBe(TOTAL);
    expect(seen).toEqual([...seen].sort());
  });

  it('queues more than 100 and the job applies them as the requester, with audit', async () => {
    await seed();
    const bulk = new BulkUpdateOpportunities({ uow, pipeline, agents, ids, clock });
    const queued = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'filter', filter: { stageId: SEEDED_STAGES.new } },
          action: { kind: 'change_stage', stageId: SEEDED_STAGES.contacted },
        },
        manager,
      ),
    );
    if (queued.mode !== 'queued') throw new Error('expected a job');

    const run = new RunOpportunityBulkOperation({
      uow,
      pipeline,
      agents,
      ids,
      clock,
      requesters: { actorFor: (userId) => Promise.resolve(userId === AGENT ? manager : undefined) },
    });
    expect(unwrap(await run.execute({ operationId: queued.operationId }, jobs))).toEqual({
      status: 'done',
    });

    const [operation] = await db
      .select()
      .from(opportunityBulkOperations)
      .where(eq(opportunityBulkOperations.id, queued.operationId));
    expect(operation).toMatchObject({
      status: 'done',
      requestedBy: AGENT,
      updatedBy: 'system:scheduler',
    });
    expect(operation?.totals).toMatchObject({ total: TOTAL, processed: TOTAL, updated: TOTAL });
    const moved = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.stageId, SEEDED_STAGES.contacted));
    expect(moved).toHaveLength(TOTAL);
    const audit = await db
      .select({ actorId: auditLog.actorId, correlationId: auditLog.correlationId })
      .from(auditLog)
      .where(eq(auditLog.action, 'opportunity.status_changed'));
    expect(audit).toHaveLength(TOTAL);
    expect(audit.every((a) => a.actorId === AGENT && a.correlationId === queued.operationId)).toBe(
      true,
    );
  });

  it('applies an automatic rule once per event, keeping the event id', async () => {
    await seed();
    const settings = { onCreate: undefined, onAssign: undefined, forOwners: undefined };
    const contacted = parseId<'OpportunityStage'>(SEEDED_STAGES.contacted);
    if (contacted.isErr()) throw new Error('invalid fixture');
    await uow.run((tx) =>
      tx.opportunitySettings.save(
        { ...settings, onReactivate: contacted.value },
        'system:import',
        NOW,
      ),
    );
    const apply = new ApplyOpportunityRules({ uow, ids, clock });
    const event = {
      eventId: ids.next(),
      opportunityId: opportunityId(TOTAL),
      trigger: { kind: 'request_added' as const },
    };

    expect(unwrap(await apply.execute(event, jobs))).toEqual({
      applied: true,
      rule: 'onReactivate',
    });
    expect(unwrap(await apply.execute(event, jobs))).toEqual({
      applied: false,
      reason: 'already_applied',
    });
    const changes = await db
      .select({ sourceEventId: opportunityStatusChanges.sourceEventId })
      .from(opportunityStatusChanges)
      .where(
        and(
          eq(opportunityStatusChanges.opportunityId, opportunityId(TOTAL)),
          isNotNull(opportunityStatusChanges.sourceEventId),
        ),
      );
    expect(changes).toEqual([{ sourceEventId: event.eventId }]);
  });

  it('stores the referral and shows it in the referred section', async () => {
    await seed();
    unwrap(
      await new UpdateOpportunityReferral({ uow, clock }).execute(
        {
          opportunityId: opportunityId(TOTAL),
          partnerName: 'Inmobiliaria Sur',
          referredAt: '2026-02-20',
          result: 'returned',
        },
        manager,
      ),
    );

    const page = await pipeline.search({
      ...NEW_SECTION,
      stageId: SEEDED_STAGES.referred_to_partner,
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: 10,
    });
    expect(page.items[0]?.referral).toEqual({
      partnerName: 'Inmobiliaria Sur',
      referredAt: new Date('2026-02-20T03:00:00Z'),
      result: 'returned',
    });
  });
});
