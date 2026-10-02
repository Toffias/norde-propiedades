import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  InMemoryClientAgents,
  InMemoryClientListings,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_PROPERTY_ID,
  PROPERTY_ID,
  seedInquiryRule,
  StubInquiryRuleQuery,
} from '../../testing';

import { GetInquiryRule } from './get-inquiry-rule';
import { ListInquiryRules } from './list-inquiry-rules';

const MANAGER = Actor.user(AGENT_ID, ['inquiries:manage', 'properties:read']);
const READER = Actor.user(OTHER_AGENT_ID, ['inquiries:read']);
const GONE_PROPERTY = '00000000-0000-7000-8000-0000000000e9';

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const first = await seedInquiryRule(uow, {
    name: 'Palermo',
    position: 0,
    conditions: { neighborhoods: ['Palermo'], propertyIds: [PROPERTY_ID, GONE_PROPERTY] },
  });
  const second = await seedInquiryRule(uow, {
    name: 'Resto',
    position: 1,
    agents: [{ userId: OTHER_AGENT_ID, weight: 1 }],
  });
  const rules = new StubInquiryRuleQuery([
    { rule: first.toSnapshot(), priority: 1 },
    { rule: second.toSnapshot(), priority: 2 },
  ]);
  const deps = { agents: new InMemoryClientAgents(), listings: new InMemoryClientListings() };
  return {
    uow,
    first,
    rules,
    list: new ListInquiryRules({ rules, ...deps }),
    get: new GetInquiryRule({ uow, ...deps }),
  };
}

describe('ListInquiryRules', () => {
  it('pages a tab by priority in the server', async () => {
    const { rules, list } = await setup();

    const page = unwrap(await list.execute({ status: 'inactive', page: 2, pageSize: 10 }, MANAGER));

    expect(rules.searches).toEqual([{ active: false, offset: 10, limit: 10 }]);
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 2 });
  });

  it('shows the agents with their share, the properties and whether each one moves', async () => {
    const { list } = await setup();

    const { items } = unwrap(await list.execute({}, MANAGER));

    expect(items[0]).toMatchObject({
      name: 'Palermo',
      priority: 1,
      canMoveUp: false,
      canMoveDown: true,
      agents: [
        { user: { id: AGENT_ID, name: 'Camila' }, weight: 2, share: 67 },
        { user: { id: OTHER_AGENT_ID, name: 'Martín' }, weight: 1, share: 33 },
      ],
      conditions: {
        neighborhoods: ['Palermo'],
        properties: [
          { id: PROPERTY_ID, summary: expect.objectContaining({ code: 'NOR-001' }) as unknown },
          // Ya no está en la cartera.
          { id: GONE_PROPERTY, summary: undefined },
        ],
      },
    });
    expect(items[1]).toMatchObject({ priority: 2, canMoveUp: true, canMoveDown: false });
  });

  it('needs "Administrar consultas" and validates the query', async () => {
    const { list } = await setup();

    expect(unwrapErr(await list.execute({}, READER))).toEqual({ type: 'Forbidden' });
    // @ts-expect-error: un estado que no existe.
    expect(unwrapErr(await list.execute({ status: 'all' }, MANAGER)).type).toBe('InvalidInput');
  });
});

describe('GetInquiryRule', () => {
  it('returns the rule with its place in the priority', async () => {
    const { uow, get } = await setup();
    const third = await seedInquiryRule(uow, {
      name: 'Otra',
      position: 2,
      conditions: { propertyIds: [OTHER_PROPERTY_ID] },
    });

    const row = unwrap(await get.execute({ ruleId: third.id }, MANAGER));

    expect(row).toMatchObject({
      id: third.id,
      name: 'Otra',
      isActive: true,
      priority: 3,
      canMoveUp: true,
      canMoveDown: false,
      conditions: { properties: [{ id: OTHER_PROPERTY_ID }] },
    });
  });

  it('reports an unknown rule and needs the permission', async () => {
    const { first, get } = await setup();

    expect(
      unwrapErr(await get.execute({ ruleId: '00000000-0000-7000-8000-0000000000ff' }, MANAGER)),
    ).toEqual({ type: 'InquiryRuleNotFound' });
    expect(unwrapErr(await get.execute({ ruleId: first.id }, READER))).toEqual({
      type: 'Forbidden',
    });
  });
});
