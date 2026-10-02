import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { ReceiveInquiryInput } from '../../contracts';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  InMemoryInquiryPropertyLookup,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  PROPERTY_ID,
  seedClient,
  seedInquiryRule,
} from '../../testing';
import { ReceiveInquiry } from '../commands/receive-inquiry';

import { RouteInquiry } from './route-inquiry';

const WEB = Actor.system('web', ['inquiries:receive']);
const SCHEDULER = Actor.system('scheduler', ['inquiries:route']);
const UNKNOWN_USER = '00000000-0000-7000-8000-0000000000c9';

let externalSequence = 0;

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const properties = new InMemoryInquiryPropertyLookup();
  properties.known.set(PROPERTY_ID, {
    branchId: OTHER_BRANCH_ID,
    propertyType: 'apartment',
    operations: ['sale'],
    neighborhood: 'Palermo',
  });
  const receive = new ReceiveInquiry({ uow, properties, ids, clock });
  return {
    uow,
    route: new RouteInquiry({ uow, agents: new InMemoryClientAgents(), ids, clock }),
    async inquiry(overrides: Partial<ReceiveInquiryInput> = {}) {
      externalSequence += 1;
      const { inquiryId } = unwrap(
        await receive.execute(
          {
            channel: 'zonaprop',
            externalId: `ZP-${String(externalSequence)}`,
            name: 'Ana Pérez',
            phone: '+54 9 11 6689-9124',
            email: 'ana@example.com',
            message: '¿Sigue disponible?',
            propertyId: PROPERTY_ID,
            ...overrides,
          },
          WEB,
        ),
      );
      // Lo que importa es lo que escribe el reparto.
      uow.events.published.length = 0;
      uow.audit.entries.length = 0;
      return inquiryId;
    },
  };
}

/** Un remitente distinto por número: no coincide con nadie. */
function person(n: number): Partial<ReceiveInquiryInput> {
  return { phone: `+54 9 11 5555-000${String(n)}`, email: `persona${String(n)}@example.com` };
}

describe('RouteInquiry', () => {
  it('assigns a new contact to the agent of the matching rule', async () => {
    const { uow, route, inquiry } = setup();
    const rule = await seedInquiryRule(uow, { conditions: { channels: ['zonaprop'] } });
    const inquiryId = await inquiry();

    const outcome = unwrap(await route.execute({ inquiryId }, SCHEDULER));

    expect(outcome).toMatchObject({ routed: true, ruleId: rule.id, agentId: AGENT_ID });
    const row = uow.inquiries.rows.get(inquiryId);
    expect(row).toMatchObject({
      status: 'assigned',
      assignedAgentId: AGENT_ID,
      branchId: BRANCH_ID,
      assignedBy: 'system:scheduler',
    });
    expect(uow.clients.rows.get(row?.clientId ?? '')).toMatchObject({
      name: 'Ana Pérez',
      agentId: AGENT_ID,
    });
    expect(uow.opportunities.rows.get(row?.opportunityId ?? '')).toMatchObject({
      agentId: AGENT_ID,
      type: 'sale',
      propertyId: PROPERTY_ID,
    });
    expect(uow.inquiryRules.rows.get(rule.id)?.cursor).toBe(1n);
    // Nace sin agente y pasa al del reparto: corren "al crear" y "al asignar".
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.client_registered',
      'clients.opportunity_created',
      'clients.opportunity_reassigned',
      'clients.inquiry_assigned',
    ]);
  });

  it('audits which rule assigned it, as the system', async () => {
    const { uow, route, inquiry } = setup();
    const rule = await seedInquiryRule(uow);
    const inquiryId = await inquiry();

    unwrap(await route.execute({ inquiryId }, SCHEDULER));

    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'inquiry.assigned',
      entityId: inquiryId,
      actorId: 'system:scheduler',
      changes: {
        status: { before: 'pending', after: 'assigned' },
        assignedAgentId: { before: null, after: AGENT_ID },
        ruleId: { before: null, after: rule.id },
      },
    });
  });

  it('distributes by weight: A with 2 and B with 1 get 2 of every 3', async () => {
    const { uow, route, inquiry } = setup();
    await seedInquiryRule(uow);

    const agents = [];
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const outcome = unwrap(
        await route.execute({ inquiryId: await inquiry(person(n)) }, SCHEDULER),
      );
      agents.push(outcome.routed ? outcome.agentId : undefined);
    }

    const [a, b] = [AGENT_ID, OTHER_AGENT_ID];
    expect(agents).toEqual([a, b, a, a, b, a]);
  });

  it('keeps the agent a matching contact already has, without moving the distribution', async () => {
    const { uow, route, inquiry } = setup();
    const rule = await seedInquiryRule(uow);
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
    const inquiryId = await inquiry();

    const outcome = unwrap(await route.execute({ inquiryId }, SCHEDULER));

    expect(outcome).toMatchObject({ routed: true, clientId: client.id, agentId: OTHER_AGENT_ID });
    expect(uow.inquiryRules.rows.get(rule.id)?.cursor).toBe(0n);
    expect(uow.events.published.map((e) => e.type)).not.toContain('clients.opportunity_reassigned');
  });

  it('gives a matching contact without an agent the one of the distribution', async () => {
    const { uow, route, inquiry } = setup();
    await seedInquiryRule(uow);
    const client = await seedClient(uow, { agentId: undefined, branchId: undefined });

    unwrap(await route.execute({ inquiryId: await inquiry() }, SCHEDULER));

    expect(uow.clients.rows.get(client.id)).toMatchObject({ agentId: AGENT_ID });
  });

  it('leaves it pending when several contacts match', async () => {
    const { uow, route, inquiry } = setup();
    const rule = await seedInquiryRule(uow);
    await seedClient(uow, { phones: ['+5491166899124'] });
    await seedClient(uow, { phones: ['+5491155550000'], emails: ['ana@example.com'] });
    const inquiryId = await inquiry();

    const outcome = unwrap(await route.execute({ inquiryId }, SCHEDULER));

    expect(outcome).toEqual({ routed: false, reason: 'ambiguous_client' });
    expect(uow.inquiries.rows.get(inquiryId)?.status).toBe('pending');
    expect(uow.inquiryRules.rows.get(rule.id)?.cursor).toBe(0n);
    expect(uow.audit.entries).toEqual([]);
  });

  it('takes the first matching active rule by priority', async () => {
    const { uow, route, inquiry } = setup();
    await seedInquiryRule(uow, {
      position: 0,
      conditions: { channels: ['zonaprop'] },
      agents: [{ userId: OTHER_AGENT_ID, weight: 1 }],
      active: false,
    });
    await seedInquiryRule(uow, { position: 1, conditions: { channels: ['web_form'] } });
    const palermo = await seedInquiryRule(uow, {
      position: 2,
      conditions: { neighborhoods: ['palermo'] },
      agents: [{ userId: OTHER_AGENT_ID, weight: 1 }],
    });
    await seedInquiryRule(uow, { position: 3 });

    const outcome = unwrap(await route.execute({ inquiryId: await inquiry() }, SCHEDULER));

    expect(outcome).toMatchObject({ routed: true, ruleId: palermo.id, agentId: OTHER_AGENT_ID });
  });

  it('leaves it pending without a matching rule', async () => {
    const { uow, route, inquiry } = setup();
    await seedInquiryRule(uow, { conditions: { channels: ['web_form'] } });
    const inquiryId = await inquiry();

    expect(unwrap(await route.execute({ inquiryId }, SCHEDULER))).toEqual({
      routed: false,
      reason: 'no_rule',
    });
    expect(uow.inquiries.rows.get(inquiryId)?.status).toBe('pending');
  });

  it('leaves it pending when no agent of the rule is active', async () => {
    const { uow, route, inquiry } = setup();
    const rule = await seedInquiryRule(uow, { agents: [{ userId: UNKNOWN_USER, weight: 1 }] });
    const inquiryId = await inquiry();

    expect(unwrap(await route.execute({ inquiryId }, SCHEDULER))).toEqual({
      routed: false,
      reason: 'no_active_agent',
    });
    expect(uow.inquiries.rows.get(inquiryId)?.status).toBe('pending');
    expect(uow.clients.rows.size).toBe(0);
    expect(uow.inquiryRules.rows.get(rule.id)?.cursor).toBe(0n);
  });

  it('does nothing with an inquiry that is no longer pending (the event arrived twice)', async () => {
    const { uow, route, inquiry } = setup();
    await seedInquiryRule(uow);
    const inquiryId = await inquiry();
    unwrap(await route.execute({ inquiryId }, SCHEDULER));
    const written = uow.audit.entries.length;

    expect(unwrap(await route.execute({ inquiryId }, SCHEDULER))).toEqual({
      routed: false,
      reason: 'not_pending',
    });
    expect(uow.audit.entries).toHaveLength(written);
    expect(uow.clients.rows.size).toBe(1);
    expect(uow.opportunities.rows.size).toBe(1);
    expect(
      unwrap(await route.execute({ inquiryId: '00000000-0000-7000-8000-0000000000ff' }, SCHEDULER)),
    ).toEqual({ routed: false, reason: 'not_found' });
  });

  it('runs only as the system with "inquiries:route"', async () => {
    const { route, inquiry } = setup();
    const inquiryId = await inquiry();
    const user = Actor.user(AGENT_ID, ['inquiries:manage', 'inquiries:route']);

    expect(unwrapErr(await route.execute({ inquiryId }, user))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await route.execute({ inquiryId }, Actor.system('scheduler', ['inquiries:read']))),
    ).toEqual({ type: 'Forbidden' });
  });
});
