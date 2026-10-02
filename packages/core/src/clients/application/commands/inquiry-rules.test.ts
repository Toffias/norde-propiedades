import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreateInquiryRuleInput } from '../../contracts';
import {
  AGENT_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  PROPERTY_ID,
  seedInquiryRule,
} from '../../testing';

import { CreateInquiryRule } from './create-inquiry-rule';
import { DeleteInquiryRule } from './delete-inquiry-rule';
import { MoveInquiryRule } from './move-inquiry-rule';
import { SetInquiryRuleActive } from './set-inquiry-rule-active';
import { UpdateInquiryRule } from './update-inquiry-rule';

const MANAGER = Actor.user(AGENT_ID, ['inquiries:manage']);
const READER = Actor.user(OTHER_AGENT_ID, ['inquiries:read']);
const UNKNOWN_USER = '00000000-0000-7000-8000-0000000000c9';

const INPUT: CreateInquiryRuleInput = {
  name: 'Zonaprop Palermo',
  conditions: { channels: ['zonaprop'], neighborhoods: ['Palermo'], propertyIds: [PROPERTY_ID] },
  agents: [
    { userId: AGENT_ID, weight: 2 },
    { userId: OTHER_AGENT_ID, weight: 1 },
  ],
};

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const agents = new InMemoryClientAgents();
  return {
    uow,
    create: new CreateInquiryRule({ uow, agents, ids: new SequentialIdGenerator(), clock }),
    update: new UpdateInquiryRule({ uow, agents, clock }),
    setActive: new SetInquiryRuleActive({ uow, clock }),
    move: new MoveInquiryRule({ uow, clock }),
    remove: new DeleteInquiryRule({ uow }),
  };
}

describe('CreateInquiryRule', () => {
  it('creates an active rule, last in priority, and audits it', async () => {
    const { uow, create } = setup();
    await seedInquiryRule(uow, { position: 4 });

    const { ruleId } = unwrap(await create.execute(INPUT, MANAGER));

    expect(uow.inquiryRules.rows.get(ruleId)).toMatchObject({
      name: 'Zonaprop Palermo',
      isActive: true,
      position: 5,
      cursor: 0n,
      conditions: {
        channels: ['zonaprop'],
        operations: [],
        neighborhoods: ['Palermo'],
        propertyIds: [PROPERTY_ID],
      },
      agents: INPUT.agents,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'inquiry_rule.created',
        entityType: 'inquiry_rule',
        entityId: ruleId,
        clientIds: [],
        changes: expect.objectContaining({
          name: { before: null, after: 'Zonaprop Palermo' },
          channels: { before: null, after: ['zonaprop'] },
          agents: { before: null, after: [`${AGENT_ID}:2`, `${OTHER_AGENT_ID}:1`] },
        }) as unknown,
      }),
    ]);
  });

  it('needs active agents', async () => {
    const { uow, create } = setup();

    const error = unwrapErr(
      await create.execute({ ...INPUT, agents: [{ userId: UNKNOWN_USER, weight: 1 }] }, MANAGER),
    );

    expect(error).toEqual({ type: 'AgentNotFound' });
    expect(uow.inquiryRules.rows.size).toBe(0);
  });

  it('rejects a rule the domain does not allow', async () => {
    const { create } = setup();

    const error = unwrapErr(
      await create.execute(
        {
          ...INPUT,
          agents: [
            { userId: AGENT_ID, weight: 1 },
            { userId: AGENT_ID, weight: 2 },
          ],
        },
        MANAGER,
      ),
    );

    expect(error).toEqual({ type: 'InvalidInquiryRule', reason: 'duplicate_agent' });
  });

  it('validates the input', async () => {
    const { create } = setup();

    const error = unwrapErr(await create.execute({ ...INPUT, agents: [] }, MANAGER));

    expect(error.type).toBe('InvalidInput');
  });

  it('needs "Administrar consultas"', async () => {
    const { uow, create } = setup();

    expect(unwrapErr(await create.execute(INPUT, READER))).toEqual({ type: 'Forbidden' });
    expect(uow.audit.entries).toEqual([]);
  });
});

describe('UpdateInquiryRule', () => {
  it('edits the rule and audits only what changed', async () => {
    const { uow, update } = setup();
    const rule = await seedInquiryRule(uow, { name: 'Web' });

    unwrap(
      await update.execute(
        {
          ruleId: rule.id,
          name: 'Web y Zonaprop',
          conditions: { channels: ['web_form', 'zonaprop'] },
          agents: rule.toSnapshot().agents.map((a) => ({ ...a })),
        },
        MANAGER,
      ),
    );

    expect(uow.inquiryRules.rows.get(rule.id)).toMatchObject({
      name: 'Web y Zonaprop',
      conditions: { channels: ['web_form', 'zonaprop'] },
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'inquiry_rule.updated',
        changes: {
          name: { before: 'Web', after: 'Web y Zonaprop' },
          channels: { before: [], after: ['web_form', 'zonaprop'] },
        },
      }),
    ]);
  });

  it('does not audit an edit without changes', async () => {
    const { uow, update } = setup();
    const rule = await seedInquiryRule(uow, { name: 'Web' });
    const { name, conditions, agents } = rule.toSnapshot();

    unwrap(
      await update.execute(
        {
          ruleId: rule.id,
          name,
          conditions: {
            channels: [...conditions.channels],
            operations: [...conditions.operations],
            propertyTypes: [...conditions.propertyTypes],
            neighborhoods: [...conditions.neighborhoods],
            propertyIds: [...conditions.propertyIds],
            developmentIds: [...conditions.developmentIds],
          },
          agents: agents.map((a) => ({ ...a })),
        },
        MANAGER,
      ),
    );

    expect(uow.audit.entries).toEqual([]);
  });

  it('reports an unknown rule or agent, and needs the permission', async () => {
    const { uow, update } = setup();
    const rule = await seedInquiryRule(uow);
    const input = { ...INPUT, ruleId: rule.id };

    expect(
      unwrapErr(
        await update.execute({ ...input, ruleId: '00000000-0000-7000-8000-0000000000ff' }, MANAGER),
      ),
    ).toEqual({ type: 'InquiryRuleNotFound' });
    expect(
      unwrapErr(
        await update.execute({ ...input, agents: [{ userId: UNKNOWN_USER, weight: 1 }] }, MANAGER),
      ),
    ).toEqual({ type: 'AgentNotFound' });
    expect(unwrapErr(await update.execute(input, READER))).toEqual({ type: 'Forbidden' });
  });
});

describe('SetInquiryRuleActive', () => {
  it('deactivates and activates, auditing each change once', async () => {
    const { uow, setActive } = setup();
    const rule = await seedInquiryRule(uow);

    unwrap(await setActive.execute({ ruleId: rule.id, active: false }, MANAGER));
    unwrap(await setActive.execute({ ruleId: rule.id, active: false }, MANAGER));
    unwrap(await setActive.execute({ ruleId: rule.id, active: true }, MANAGER));

    expect(uow.inquiryRules.rows.get(rule.id)?.isActive).toBe(true);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'inquiry_rule.deactivated',
      'inquiry_rule.activated',
    ]);
  });

  it('reports an unknown rule and needs the permission', async () => {
    const { uow, setActive } = setup();
    const rule = await seedInquiryRule(uow);

    expect(
      unwrapErr(
        await setActive.execute(
          { ruleId: '00000000-0000-7000-8000-0000000000ff', active: false },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'InquiryRuleNotFound' });
    expect(unwrapErr(await setActive.execute({ ruleId: rule.id, active: false }, READER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('MoveInquiryRule', () => {
  it('swaps the priority with the next rule of the same tab', async () => {
    const { uow, move } = setup();
    const first = await seedInquiryRule(uow, { position: 0 });
    const inactive = await seedInquiryRule(uow, { position: 1, active: false });
    const second = await seedInquiryRule(uow, { position: 2 });

    unwrap(await move.execute({ ruleId: first.id, direction: 'down' }, MANAGER));

    expect(uow.inquiryRules.rows.get(first.id)?.position).toBe(2);
    expect(uow.inquiryRules.rows.get(second.id)?.position).toBe(0);
    expect(uow.inquiryRules.rows.get(inactive.id)?.position).toBe(1);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'inquiry_rule.moved',
        entityId: first.id,
        changes: { position: { before: 0, after: 2 } },
      }),
    ]);
  });

  it('does not move the first one up or the last one down', async () => {
    const { uow, move } = setup();
    const first = await seedInquiryRule(uow, { position: 0 });
    const last = await seedInquiryRule(uow, { position: 1 });

    unwrap(await move.execute({ ruleId: first.id, direction: 'up' }, MANAGER));
    unwrap(await move.execute({ ruleId: last.id, direction: 'down' }, MANAGER));

    expect(uow.inquiryRules.rows.get(first.id)?.position).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('separates two rules with the same position', async () => {
    const { uow, move } = setup();
    const a = await seedInquiryRule(uow, { position: 3 });
    const b = await seedInquiryRule(uow, { position: 3 });

    unwrap(await move.execute({ ruleId: b.id, direction: 'up' }, MANAGER));

    expect(uow.inquiryRules.rows.get(b.id)?.position).toBe(2);
    expect(uow.inquiryRules.rows.get(a.id)?.position).toBe(3);
  });

  it('needs the permission', async () => {
    const { uow, move } = setup();
    const rule = await seedInquiryRule(uow);

    expect(unwrapErr(await move.execute({ ruleId: rule.id, direction: 'up' }, READER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('DeleteInquiryRule', () => {
  it('deletes the rule and keeps its values in the audit', async () => {
    const { uow, remove } = setup();
    const rule = await seedInquiryRule(uow, { name: 'Vieja' });

    unwrap(await remove.execute({ ruleId: rule.id }, MANAGER));

    expect(uow.inquiryRules.rows.size).toBe(0);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'inquiry_rule.deleted',
        entityId: rule.id,
        changes: expect.objectContaining({ name: { before: 'Vieja', after: null } }) as unknown,
      }),
    ]);
  });

  it('reports an unknown rule and needs the permission', async () => {
    const { uow, remove } = setup();
    const rule = await seedInquiryRule(uow);

    expect(
      unwrapErr(await remove.execute({ ruleId: '00000000-0000-7000-8000-0000000000ff' }, MANAGER)),
    ).toEqual({ type: 'InquiryRuleNotFound' });
    expect(unwrapErr(await remove.execute({ ruleId: rule.id }, READER))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.inquiryRules.rows.size).toBe(1);
  });
});
