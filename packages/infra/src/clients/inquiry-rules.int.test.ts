import {
  CreateInquiryRule,
  DeleteInquiryRule,
  MoveInquiryRule,
  ReceiveInquiry,
  RouteInquiry,
  SetInquiryRuleActive,
  type ClientAgents,
  type CreateInquiryRuleInput,
  type InquiryPropertyLookup,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import {
  clients,
  inquiries,
  inquiryAssignmentRuleAgents,
  inquiryAssignmentRules,
  opportunities,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleInquiryRuleQuery } from './drizzle-inquiry-rule-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T15:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const query = new DrizzleInquiryRuleQuery(db);

const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const A = '00000000-0000-7000-8000-0000000000a1';
const B = '00000000-0000-7000-8000-0000000000a2';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const MANAGER = Actor.user(A, ['inquiries:manage']);
const WEB = Actor.system('web', ['inquiries:receive']);
const SCHEDULER = Actor.system('scheduler', ['inquiries:route']);

const agents: ClientAgents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: (userId) => Promise.resolve([A, B].includes(userId) ? { branchId: BRANCH } : undefined),
};
const properties: InquiryPropertyLookup = {
  facts: () =>
    Promise.resolve({
      branchId: BRANCH,
      propertyType: 'apartment',
      operations: ['sale'],
      neighborhood: 'Palermo',
    }),
};
const create = new CreateInquiryRule({ uow, agents, ids, clock });
const receive = new ReceiveInquiry({ uow, properties, ids, clock });
const route = new RouteInquiry({ uow, agents, ids, clock });

const RULE: CreateInquiryRuleInput = {
  name: 'Zonaprop Palermo',
  conditions: { channels: ['zonaprop'], neighborhoods: ['Palermo'], propertyIds: [PROPERTY] },
  agents: [
    { userId: B, weight: 1 },
    { userId: A, weight: 2 },
  ],
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function inquiryFrom(n: number): Promise<string> {
  const { inquiryId } = unwrap(
    await receive.execute(
      {
        channel: 'zonaprop',
        externalId: `ZP-${String(n)}`,
        name: `Persona ${String(n)}`,
        phone: `+54 9 11 5555-00${String(n).padStart(2, '0')}`,
        propertyId: PROPERTY,
      },
      WEB,
    ),
  );
  return inquiryId;
}

describe('DrizzleInquiryRuleRepository', () => {
  it('keeps the conditions and the agents in their order', async () => {
    const { ruleId } = unwrap(await create.execute(RULE, MANAGER));

    const [rule] = await uow.run((tx) => tx.inquiryRules.findAll());

    expect(rule?.toSnapshot()).toMatchObject({
      id: ruleId,
      name: 'Zonaprop Palermo',
      isActive: true,
      position: 0,
      cursor: 0n,
      conditions: {
        channels: ['zonaprop'],
        operations: [],
        propertyTypes: [],
        neighborhoods: ['Palermo'],
        propertyIds: [PROPERTY],
        developmentIds: [],
      },
      agents: [
        { userId: B, weight: 1 },
        { userId: A, weight: 2 },
      ],
    });
  });

  it('deletes the agents with the rule', async () => {
    const { ruleId } = unwrap(await create.execute(RULE, MANAGER));

    unwrap(await new DeleteInquiryRule({ uow }).execute({ ruleId }, MANAGER));

    expect(await db.select().from(inquiryAssignmentRules)).toEqual([]);
    expect(await db.select().from(inquiryAssignmentRuleAgents)).toEqual([]);
  });
});

describe('DrizzleInquiryRuleQuery', () => {
  it('pages each tab by priority, with the place in the tab', async () => {
    const created = [];
    for (const name of ['Primera', 'Inactiva', 'Segunda', 'Tercera']) {
      created.push(unwrap(await create.execute({ ...RULE, name }, MANAGER)).ruleId);
    }
    const [first, inactive, second, third] = created;
    unwrap(
      await new SetInquiryRuleActive({ uow, clock }).execute(
        { ruleId: inactive ?? '', active: false },
        MANAGER,
      ),
    );
    unwrap(
      await new MoveInquiryRule({ uow, clock }).execute(
        { ruleId: third ?? '', direction: 'up' },
        MANAGER,
      ),
    );

    const page1 = await query.search({ active: true, offset: 0, limit: 2 });
    const page2 = await query.search({ active: true, offset: 2, limit: 2 });
    const inactiveTab = await query.search({ active: false, offset: 0, limit: 25 });

    expect(page1.total).toBe(3);
    expect([...page1.items, ...page2.items].map((i) => [i.rule.id, i.priority])).toEqual([
      [first, 1],
      [third, 2],
      [second, 3],
    ]);
    expect(inactiveTab.items.map((i) => [i.rule.id, i.priority])).toEqual([[inactive, 1]]);
    expect(page1.items[0]?.rule.agents).toEqual(RULE.agents);
  });
});

describe('RouteInquiry (Postgres)', () => {
  it('distributes inquiries arriving at once by weight, without repeating a turn', async () => {
    const { ruleId } = unwrap(await create.execute(RULE, MANAGER));
    const received = [];
    for (const n of [1, 2, 3, 4, 5, 6]) received.push(await inquiryFrom(n));

    const outcomes = await Promise.all(
      received.map((inquiryId) => route.execute({ inquiryId }, SCHEDULER)),
    );

    const assigned = outcomes.map((o) => {
      const value = unwrap(o);
      return value.routed ? value.agentId : undefined;
    });
    // B con 1 y A con 2: dos vueltas completas, sea cual sea el orden en que entraron.
    expect(assigned.filter((id) => id === A)).toHaveLength(4);
    expect(assigned.filter((id) => id === B)).toHaveLength(2);
    const [rule] = await db
      .select()
      .from(inquiryAssignmentRules)
      .where(eq(inquiryAssignmentRules.id, ruleId));
    expect(rule?.cursor).toBe(6n);
    expect(await db.select().from(clients)).toHaveLength(6);
  });

  it('routing the same inquiry again does not create a second client or opportunity', async () => {
    unwrap(await create.execute(RULE, MANAGER));
    const inquiryId = await inquiryFrom(1);

    const [first, again] = await Promise.all([
      route.execute({ inquiryId }, SCHEDULER),
      route.execute({ inquiryId }, SCHEDULER),
    ]);

    expect([unwrap(first).routed, unwrap(again).routed].sort()).toEqual([false, true]);
    expect(await db.select().from(clients)).toHaveLength(1);
    expect(await db.select().from(opportunities)).toHaveLength(1);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
    expect(row).toMatchObject({ status: 'assigned', assignedBy: 'system:scheduler' });
  });
});
