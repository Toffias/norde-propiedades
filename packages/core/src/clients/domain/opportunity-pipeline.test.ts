import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';

import type { ClientId } from './client';
import { Opportunity, type OpportunityStatusChangeId } from './opportunity';
import {
  closingStatusFor,
  MAX_CLOSE_REASONS,
  OpportunityCloseReason,
} from './opportunity-close-reason';
import { checkRules, initialStage, isStageUsedByRules, NO_RULES } from './opportunity-settings';
import {
  applyOrder,
  firstActiveStageOf,
  MAX_OPPORTUNITY_STAGES,
  OpportunityStage,
} from './opportunity-stage';
import type { OpportunityStatus } from './opportunity-status';
import { stageTenure } from './opportunity-tenure';

const T0 = new Date('2026-03-01T10:00:00Z');
const T1 = new Date('2026-03-04T09:00:00Z');
const T2 = new Date('2026-03-10T12:00:00Z');

function id<T extends string>(suffix: number) {
  const parsed = parseId<T>(`00000000-0000-7000-8000-${suffix.toString().padStart(12, '0')}`);
  if (parsed.isErr()) throw new Error('Invalid test id');
  return parsed.value;
}

let changeSequence = 900;
const change = (now: Date) => ({ id: id<'OpportunityStatusChange'>(changeSequence++), now });

let stageSequence = 100;
function aStage(category: OpportunityStatus, overrides: { name?: string; position?: number } = {}) {
  const created = OpportunityStage.create({
    id: id<'OpportunityStage'>(stageSequence++),
    name: overrides.name ?? category,
    color: '#3B82F6',
    category,
    existingCount: overrides.position ?? 0,
    now: T0,
  });
  if (created.isErr()) throw new Error('unexpected');
  return created.value;
}

function aReason(rating: 'positive' | 'negative' | 'neutral') {
  const created = OpportunityCloseReason.create({
    id: id<'OpportunityCloseReason'>(200),
    name: 'Compró',
    rating,
    existingCount: 0,
    now: T0,
  });
  if (created.isErr()) throw new Error('unexpected');
  return created.value;
}

const CLIENT = id<'Client'>(1) satisfies ClientId;

function openAt(stage: OpportunityStage) {
  const opportunity = Opportunity.open({
    id: id<'Opportunity'>(50),
    clientId: CLIENT,
    originChannel: 'whatsapp',
    type: 'sale',
    intent: 'visit',
    stage: stage.ref(),
    agent: { agentId: 'agent-1', branchId: 'branch-1' },
    statusChangeId: id<'OpportunityStatusChange'>(51) satisfies OpportunityStatusChangeId,
    now: T0,
  });
  opportunity.pullEvents();
  return opportunity;
}

describe('OpportunityStage', () => {
  it('is created at the end, active, with a normalized name and color', () => {
    const stage = aStage('visiting', { name: '  Visita   agendada ', position: 3 });

    expect(stage.toSnapshot()).toMatchObject({
      name: 'Visita agendada',
      color: '#3b82f6',
      position: 3,
      category: 'visiting',
      isActive: true,
    });
  });

  it('caps the number of stages', () => {
    const created = OpportunityStage.create({
      id: id<'OpportunityStage'>(300),
      name: 'Otro',
      color: '#000000',
      category: 'new',
      existingCount: MAX_OPPORTUNITY_STAGES,
      now: T0,
    });

    expect(created.isErr() && created.error).toEqual({
      type: 'TooManyStages',
      max: MAX_OPPORTUNITY_STAGES,
    });
  });

  it('reports whether an update changed anything', () => {
    const stage = aStage('new', { name: 'Nuevo' });

    expect(stage.update({ name: 'Nuevo', color: '#3b82f6' }, T1)).toBe(false);
    expect(stage.update({ name: 'Sin contactar', color: '#3b82f6' }, T1)).toBe(true);
    expect(stage.name).toBe('Sin contactar');
  });

  it('keeps one active stage per category and the ones used by a rule', () => {
    const stage = aStage('new');

    expect(stage.deactivate({ activeInCategory: 1, usedByRule: false }, T1).isErr()).toBe(true);
    const used = stage.deactivate({ activeInCategory: 2, usedByRule: true }, T1);
    expect(used.isErr() && used.error).toEqual({ type: 'StageUsedByRule' });

    expect(stage.deactivate({ activeInCategory: 2, usedByRule: false }, T1).isOk()).toBe(true);
    expect(stage.isActive).toBe(false);
    expect(stage.reactivate(T2)).toBe(true);
    expect(stage.isActive).toBe(true);
  });

  it('applies a full order and rejects a partial or repeated one', () => {
    const a = aStage('new', { position: 0 });
    const b = aStage('contacted', { position: 1 });

    const changed = applyOrder([a, b], [b.id, a.id], T1);
    expect(changed.isOk() && changed.value.map((s) => s.id)).toEqual([b.id, a.id]);
    expect([a.position, b.position]).toEqual([1, 0]);

    expect(applyOrder([a, b], [a.id], T1).isErr()).toBe(true);
    expect(applyOrder([a, b], [a.id, a.id], T1).isErr()).toBe(true);
  });

  it('finds the first active stage of a category by position', () => {
    const later = aStage('new', { position: 4 });
    const first = aStage('new', { position: 1 });
    const inactive = aStage('new', { position: 0 });
    inactive.deactivate({ activeInCategory: 3, usedByRule: false }, T1);

    expect(firstActiveStageOf([later, first, inactive], 'new')?.id).toBe(first.id);
    expect(firstActiveStageOf([later], 'won')).toBeUndefined();
  });
});

describe('OpportunityCloseReason', () => {
  it('maps its rating to won or lost', () => {
    expect(closingStatusFor('positive')).toBe('won');
    expect(closingStatusFor('negative')).toBe('lost');
    expect(closingStatusFor('neutral')).toBe('lost');
  });

  it('caps the number of reasons and keeps one active', () => {
    const created = OpportunityCloseReason.create({
      id: id<'OpportunityCloseReason'>(201),
      name: 'Otro',
      rating: 'neutral',
      existingCount: MAX_CLOSE_REASONS,
      now: T0,
    });
    expect(created.isErr()).toBe(true);

    const reason = aReason('negative');
    expect(reason.deactivate(1, T1).isErr()).toBe(true);
    expect(reason.deactivate(2, T1).isOk()).toBe(true);
    expect(reason.isActive).toBe(false);
  });
});

describe('Opportunity stages', () => {
  it('records the initial stage in the history', () => {
    const stage = aStage('new');
    const opportunity = openAt(stage);

    expect(opportunity.toSnapshot()).toMatchObject({
      status: 'new',
      stageId: stage.id,
      agentId: 'agent-1',
      branchId: 'branch-1',
      statusChangedAt: T0,
    });
    expect(opportunity.pullStatusChanges()).toEqual([
      expect.objectContaining({ fromStatus: undefined, toStageId: stage.id, toStatus: 'new' }),
    ]);
  });

  it('moves freely between stages of the same category', () => {
    const first = aStage('contacted');
    const second = aStage('contacted');
    const opportunity = openAt(aStage('new'));
    opportunity.moveToStage(first.ref(), change(T1));

    const moved = opportunity.moveToStage(second.ref(), change(T2));

    expect(moved.isOk() && moved.value).toBe(true);
    expect(opportunity.stageId).toBe(second.id);
    expect(opportunity.toSnapshot().statusChangedAt).toEqual(T2);
  });

  it('validates the transition between categories, also with editable stages', () => {
    const opportunity = openAt(aStage('new'));

    const invalid = opportunity.moveToStage(aStage('negotiating').ref(), change(T1));

    expect(invalid.isErr() && invalid.error).toEqual({
      type: 'InvalidStatusTransition',
      from: 'new',
      to: 'negotiating',
    });
    expect(opportunity.status).toBe('new');
    expect(opportunity.pullEvents()).toEqual([]);
  });

  it('emits the change with both stages and keeps it for the history', () => {
    const from = aStage('new');
    const to = aStage('contacted');
    const opportunity = openAt(from);
    opportunity.pullStatusChanges();

    opportunity.moveToStage(to.ref(), change(T1));

    const events = opportunity.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'clients.opportunity_status_changed',
      payload: { from: 'new', to: 'contacted', fromStageId: from.id, toStageId: to.id },
    });
    expect(opportunity.pullStatusChanges()).toEqual([
      expect.objectContaining({
        fromStageId: from.id,
        fromStatus: 'new',
        toStageId: to.id,
        toStatus: 'contacted',
        changedAt: T1,
      }),
    ]);
  });

  it('does nothing when moving to its own stage', () => {
    const stage = aStage('new');
    const opportunity = openAt(stage);

    const moved = opportunity.moveToStage(stage.ref(), change(T1));

    expect(moved.isOk() && moved.value).toBe(false);
    expect(opportunity.pullEvents()).toEqual([]);
  });

  it('rejects an inactive stage and reaching won or lost without a reason', () => {
    const opportunity = openAt(aStage('visiting'));
    const inactive = aStage('negotiating');
    inactive.deactivate({ activeInCategory: 2, usedByRule: false }, T1);

    const toInactive = opportunity.moveToStage(inactive.ref(), change(T1));
    expect(toInactive.isErr() && toInactive.error).toEqual({ type: 'StageInactive' });
    const toWon = opportunity.moveToStage(aStage('won').ref(), change(T1));
    expect(toWon.isErr() && toWon.error).toEqual({ type: 'CloseRequiresReason' });
  });

  it('closes with a reason whose rating decides won or lost', () => {
    const reason = aReason('positive');
    const opportunity = openAt(aStage('negotiating'));

    const mismatch = opportunity.close(reason.ref(), aStage('lost').ref(), change(T1));
    expect(mismatch.isErr() && mismatch.error).toEqual({ type: 'CloseStageMismatch' });

    const won = aStage('won');
    expect(opportunity.close(reason.ref(), won.ref(), change(T2)).isOk()).toBe(true);
    expect(opportunity.toSnapshot()).toMatchObject({
      status: 'won',
      stageId: won.id,
      closedAt: T2,
      closeReasonId: reason.id,
    });
    expect(opportunity.isOpen()).toBe(false);
  });

  it('keeps won and lost final', () => {
    const opportunity = openAt(aStage('negotiating'));
    opportunity.close(aReason('negative').ref(), aStage('lost').ref(), change(T1));

    const moved = opportunity.moveToStage(aStage('contacted').ref(), change(T2));
    expect(moved.isErr() && moved.error).toEqual({ type: 'OpportunityClosed' });
    const closed = opportunity.close(aReason('negative').ref(), aStage('lost').ref(), change(T2));
    expect(closed.isErr() && closed.error).toEqual({ type: 'OpportunityClosed' });
  });

  it('cannot close through an invalid transition or with an inactive reason', () => {
    const opportunity = openAt(aStage('new'));

    const fromNew = opportunity.close(aReason('positive').ref(), aStage('won').ref(), change(T1));
    expect(fromNew.isErr() && fromNew.error).toMatchObject({ type: 'InvalidStatusTransition' });

    const reason = aReason('negative');
    reason.deactivate(2, T1);
    const inactive = opportunity.close(reason.ref(), aStage('lost').ref(), change(T1));
    expect(inactive.isErr() && inactive.error).toEqual({ type: 'CloseReasonInactive' });
  });
});

describe('stageTenure', () => {
  it('counts from the last status change in the history', () => {
    const tenure = stageTenure(
      [{ changedAt: T0 }, { changedAt: T1 }, { changedAt: new Date('2026-03-02T00:00:00Z') }],
      T0,
      T2,
    );

    expect(tenure).toEqual({ since: T1, days: 6 });
  });

  it('counts from the creation without changes, and never goes negative', () => {
    expect(stageTenure([], T0, T1)).toEqual({ since: T0, days: 2 });
    expect(stageTenure([], T2, T0).days).toBe(0);
  });
});

describe('Opportunity rules', () => {
  const nuevo = aStage('new', { position: 0 });
  const sinContactar = aStage('new', { position: 1 });
  const referred = aStage('referred_to_partner', { position: 2 });
  const won = aStage('won', { position: 3 });
  const stages = [nuevo, sinContactar, referred, won];

  it('starts a new opportunity in the configured stage, or the first of "new"', () => {
    expect(initialStage(stages, NO_RULES, false)?.id).toBe(nuevo.id);
    expect(initialStage(stages, { ...NO_RULES, onCreate: sinContactar.id }, false)?.id).toBe(
      sinContactar.id,
    );
    expect(initialStage(stages, { ...NO_RULES, onCreate: sinContactar.id }, true)?.id).toBe(
      referred.id,
    );
  });

  it('only accepts active stages of open categories', () => {
    expect(checkRules({ ...NO_RULES, onAssign: sinContactar.id }, stages).isOk()).toBe(true);
    const closed = checkRules({ ...NO_RULES, onAssign: won.id }, stages);
    expect(closed.isErr() && closed.error).toEqual({ type: 'InvalidRuleStage', rule: 'onAssign' });
    expect(checkRules({ ...NO_RULES, onCreate: referred.id }, stages).isErr()).toBe(true);
    expect(checkRules({ ...NO_RULES, onReactivate: referred.id }, stages).isOk()).toBe(true);
  });

  it('knows which stages the rules use', () => {
    const rules = { ...NO_RULES, forOwners: sinContactar.id };

    expect(isStageUsedByRules(rules, sinContactar.id)).toBe(true);
    expect(isStageUsedByRules(rules, nuevo.id)).toBe(false);
  });
});
