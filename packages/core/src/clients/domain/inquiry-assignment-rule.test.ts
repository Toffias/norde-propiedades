import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { unwrap, unwrapErr } from '../../shared/testing';

import {
  ANY_INQUIRY,
  findRuleFor,
  InquiryAssignmentRule,
  inquiryRoutingFacts,
  MAX_INQUIRY_RULES,
  type InquiryRoutingFacts,
  type InquiryRuleConditions,
} from './inquiry-assignment-rule';

const NOW = new Date('2026-03-01T10:00:00Z');
const LATER = new Date('2026-03-02T10:00:00Z');
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';

function ruleId(n: number) {
  return unwrap(
    parseId<'InquiryAssignmentRule'>(
      `00000000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
    ),
  );
}

function rule(
  overrides: {
    readonly n?: number;
    readonly name?: string;
    readonly conditions?: Partial<InquiryRuleConditions>;
    readonly agents?: { userId: string; weight: number }[];
    readonly position?: number;
  } = {},
) {
  return InquiryAssignmentRule.create({
    id: ruleId(overrides.n ?? 1),
    name: overrides.name ?? 'Zonaprop Palermo',
    conditions: { ...ANY_INQUIRY, ...overrides.conditions },
    agents: overrides.agents ?? [
      { userId: 'A', weight: 2 },
      { userId: 'B', weight: 1 },
    ],
    existingCount: 0,
    nextPosition: overrides.position ?? 0,
    now: NOW,
  });
}

const FACTS: InquiryRoutingFacts = {
  channel: 'zonaprop',
  operations: ['sale', 'rent'],
  propertyType: 'apartment',
  neighborhood: 'Palermo',
  propertyId: PROPERTY,
  developmentId: undefined,
};

describe('InquiryAssignmentRule', () => {
  it('is created active, with clean conditions and the cursor at zero', () => {
    const created = unwrap(
      rule({
        name: '  Zonaprop   Palermo ',
        conditions: { channels: ['zonaprop', 'zonaprop'], neighborhoods: [' Palermo  Soho '] },
      }),
    );

    expect(created.toSnapshot()).toMatchObject({
      name: 'Zonaprop Palermo',
      isActive: true,
      position: 0,
      cursor: 0n,
      conditions: { channels: ['zonaprop'], neighborhoods: ['Palermo Soho'] },
    });
  });

  it('needs a name and at least one agent, without repeating them', () => {
    expect(unwrapErr(rule({ name: '  ' }))).toEqual({ type: 'InvalidInquiryRule', reason: 'name' });
    expect(unwrapErr(rule({ agents: [] }))).toEqual({
      type: 'InvalidInquiryRule',
      reason: 'no_agents',
    });
    expect(
      unwrapErr(
        rule({
          agents: [
            { userId: 'A', weight: 1 },
            { userId: 'A', weight: 2 },
          ],
        }),
      ),
    ).toEqual({ type: 'InvalidInquiryRule', reason: 'duplicate_agent' });
  });

  it('takes weights from 1 to 10', () => {
    for (const weight of [0, 11, 1.5]) {
      expect(unwrapErr(rule({ agents: [{ userId: 'A', weight }] }))).toEqual({
        type: 'InvalidInquiryRule',
        reason: 'weight',
        min: 1,
        max: 10,
      });
    }
  });

  it('has a maximum of rules', () => {
    const error = unwrapErr(
      InquiryAssignmentRule.create({
        id: ruleId(1),
        name: 'Una más',
        conditions: ANY_INQUIRY,
        agents: [{ userId: 'A', weight: 1 }],
        existingCount: MAX_INQUIRY_RULES,
        nextPosition: MAX_INQUIRY_RULES,
        now: NOW,
      }),
    );

    expect(error).toEqual({ type: 'TooManyInquiryRules', max: MAX_INQUIRY_RULES });
  });

  it('restarts the distribution when the agents or their weights change', () => {
    const edited = unwrap(rule());
    edited.assignNext(new Set(['A', 'B']), NOW);

    unwrap(
      edited.edit(
        { name: 'Otro nombre', conditions: ANY_INQUIRY, agents: edited.toSnapshot().agents },
        LATER,
      ),
    );
    expect(edited.toSnapshot().cursor).toBe(1n);

    unwrap(
      edited.edit(
        { name: 'Otro nombre', conditions: ANY_INQUIRY, agents: [{ userId: 'A', weight: 3 }] },
        LATER,
      ),
    );
    expect(edited.toSnapshot()).toMatchObject({ cursor: 0n, updatedAt: LATER });
  });

  it('reports an edit without changes', () => {
    const same = unwrap(rule());
    const { name, conditions, agents } = same.toSnapshot();

    expect(unwrap(same.edit({ name, conditions, agents }, LATER))).toBe(false);
  });
});

describe('InquiryAssignmentRule.matches', () => {
  it('takes any inquiry without conditions', () => {
    expect(unwrap(rule()).matches(FACTS)).toBe(true);
  });

  it('needs every condition, and one value of each', () => {
    const palermoSale = unwrap(
      rule({
        conditions: {
          channels: ['zonaprop', 'argenprop'],
          operations: ['sale'],
          neighborhoods: ['palermo', 'Belgrano'],
        },
      }),
    );

    expect(palermoSale.matches(FACTS)).toBe(true);
    expect(palermoSale.matches({ ...FACTS, channel: 'web_form' })).toBe(false);
    expect(palermoSale.matches({ ...FACTS, operations: ['rent'] })).toBe(false);
    expect(palermoSale.matches({ ...FACTS, neighborhood: 'Caballito' })).toBe(false);
  });

  it('compares the zone without accents or capitals', () => {
    const nunez = unwrap(rule({ conditions: { neighborhoods: ['Núñez'] } }));

    expect(nunez.matches({ ...FACTS, neighborhood: 'nuñez' })).toBe(true);
    expect(nunez.matches({ ...FACTS, neighborhood: 'NUNEZ' })).toBe(true);
  });

  it('does not take an inquiry without the value a condition asks for', () => {
    const byProperty = unwrap(rule({ conditions: { propertyIds: [PROPERTY.toUpperCase()] } }));
    const byType = unwrap(rule({ conditions: { propertyTypes: ['house'] } }));

    expect(byProperty.matches(FACTS)).toBe(true);
    expect(byProperty.matches({ ...FACTS, propertyId: undefined })).toBe(false);
    expect(byType.matches(FACTS)).toBe(false);
  });

  it('takes nothing while inactive', () => {
    const inactive = unwrap(rule());
    inactive.setActive(false, LATER);

    expect(inactive.matches(FACTS)).toBe(false);
  });
});

describe('InquiryAssignmentRule.assignNext', () => {
  it('distributes among the active agents by weight and moves the cursor', () => {
    const weighted = unwrap(rule());
    const active = new Set(['A', 'B']);

    const picks = [1, 2, 3].map(() => weighted.assignNext(active, LATER));

    expect(picks).toEqual(['A', 'B', 'A']);
    expect(weighted.toSnapshot()).toMatchObject({ cursor: 3n, updatedAt: LATER });
  });

  it('skips inactive agents, and with none active does not move', () => {
    const weighted = unwrap(rule());

    expect(weighted.assignNext(new Set(['B']), LATER)).toBe('B');
    expect(weighted.assignNext(new Set(), LATER)).toBeUndefined();
    expect(weighted.toSnapshot().cursor).toBe(1n);
  });
});

describe('findRuleFor', () => {
  it('takes the first matching active rule by priority', () => {
    const catchAll = unwrap(rule({ n: 1, name: 'Todo', position: 5 }));
    const zonaprop = unwrap(
      rule({ n: 2, name: 'Zonaprop', position: 2, conditions: { channels: ['zonaprop'] } }),
    );
    const web = unwrap(
      rule({ n: 3, name: 'Web', position: 1, conditions: { channels: ['web_form'] } }),
    );

    expect(findRuleFor([catchAll, zonaprop, web], FACTS)?.id).toBe(zonaprop.id);
    expect(findRuleFor([catchAll, zonaprop, web], { ...FACTS, channel: 'office' })?.id).toBe(
      catchAll.id,
    );
    expect(findRuleFor([zonaprop], { ...FACTS, channel: 'office' })).toBeUndefined();
  });
});

describe('inquiryRoutingFacts', () => {
  it('reads the operations, type and zone from the automatic tags', () => {
    const snapshot = {
      channel: 'zonaprop' as const,
      autoTags: [
        'channel:zonaprop',
        'operation:sale',
        'operation:rent',
        'type:apartment',
        'neighborhood:Villa Crespo',
      ],
      propertyId: PROPERTY,
      developmentId: undefined,
    };

    expect(inquiryRoutingFacts(snapshot)).toEqual({
      channel: 'zonaprop',
      operations: ['sale', 'rent'],
      propertyType: 'apartment',
      neighborhood: 'Villa Crespo',
      propertyId: PROPERTY,
      developmentId: undefined,
    });
  });
});
