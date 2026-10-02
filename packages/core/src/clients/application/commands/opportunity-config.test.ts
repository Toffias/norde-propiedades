import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  closeReasonFixtureId,
  DEFAULT_STAGES,
  InMemoryClientsUnitOfWork,
  stageFixtureId,
  TEST_AGENT,
} from '../../testing';
import { GetOpportunityConfiguration } from '../queries/get-opportunity-configuration';

import { CreateCloseReason } from './create-close-reason';
import { CreateOpportunityStage } from './create-opportunity-stage';
import { DeactivateCloseReason } from './deactivate-close-reason';
import { DeactivateOpportunityStage } from './deactivate-opportunity-stage';
import { ReactivateCloseReason } from './reactivate-close-reason';
import { ReactivateOpportunityStage } from './reactivate-opportunity-stage';
import { ReorderCloseReasons } from './reorder-close-reasons';
import { ReorderOpportunityStages } from './reorder-opportunity-stages';
import { UpdateCloseReason } from './update-close-reason';
import { UpdateOpportunitySettings } from './update-opportunity-settings';
import { UpdateOpportunityStage } from './update-opportunity-stage';

const ADMIN = Actor.user('00000000-0000-7000-8000-0000000000a1', ['settings:*']);
const UNKNOWN_ID = '00000000-0000-7000-8000-0000000000ff';
const NEW = stageFixtureId(0);
const CONTACTED = stageFixtureId(1);
const WON = stageFixtureId(4);

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  return { uow, clock, ids };
}

describe('CreateOpportunityStage', () => {
  it('adds an active stage at the end of its category and audits it', async () => {
    const { uow, clock, ids } = setup();
    const useCase = new CreateOpportunityStage({ uow, ids, clock });

    const { stageId } = unwrap(
      await useCase.execute(
        { name: 'Visita agendada', color: '#8B5CF6', category: 'visiting' },
        ADMIN,
      ),
    );

    expect(uow.stages.rows.get(stageId)).toMatchObject({
      name: 'Visita agendada',
      color: '#8b5cf6',
      category: 'visiting',
      position: DEFAULT_STAGES.length,
      isActive: true,
    });
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'created',
      action: 'opportunity_stage.created',
      entityType: 'opportunity_stage',
      entityId: stageId,
      clientIds: [],
      changes: {
        name: { before: null, after: 'Visita agendada' },
        category: { before: null, after: 'visiting' },
      },
    });
  });

  it('validates the input and requires settings:update', async () => {
    const { uow, clock, ids } = setup();
    const useCase = new CreateOpportunityStage({ uow, ids, clock });

    expect(
      unwrapErr(await useCase.execute({ name: 'X', color: 'azul', category: 'new' }, ADMIN)),
    ).toMatchObject({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await useCase.execute({ name: 'X', color: '#000000', category: 'new' }, TEST_AGENT),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.audit.entries).toEqual([]);
  });
});

describe('UpdateOpportunityStage', () => {
  it('renames and audits only what changed', async () => {
    const { uow, clock } = setup();
    const useCase = new UpdateOpportunityStage({ uow, clock });

    unwrap(await useCase.execute({ stageId: NEW, name: 'Sin contactar', color: '#3b82f6' }, ADMIN));
    unwrap(await useCase.execute({ stageId: NEW, name: 'Sin contactar', color: '#3b82f6' }, ADMIN));

    expect(uow.stages.rows.get(NEW)?.name).toBe('Sin contactar');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'opportunity_stage.updated',
        changes: { name: { before: 'Nuevo', after: 'Sin contactar' } },
      }),
    ]);
  });

  it('fails for an unknown stage and without permission', async () => {
    const { uow, clock } = setup();
    const useCase = new UpdateOpportunityStage({ uow, clock });
    const input = { stageId: UNKNOWN_ID, name: 'X', color: '#000000' };

    expect(unwrapErr(await useCase.execute(input, ADMIN))).toEqual({ type: 'StageNotFound' });
    expect(unwrapErr(await useCase.execute({ ...input, stageId: NEW }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ReorderOpportunityStages', () => {
  it('saves the new positions and audits each stage that moved', async () => {
    const { uow, clock } = setup();
    const useCase = new ReorderOpportunityStages({ uow, clock });
    const order = DEFAULT_STAGES.map((_, index) => stageFixtureId(index));
    [order[0], order[1]] = [CONTACTED, NEW];

    unwrap(await useCase.execute({ stageIds: order }, ADMIN));

    expect(uow.stages.rows.get(NEW)?.position).toBe(1);
    expect(uow.stages.rows.get(CONTACTED)?.position).toBe(0);
    expect(uow.audit.entries.map((e) => [e.action, e.entityId])).toEqual([
      ['opportunity_stage.reordered', CONTACTED],
      ['opportunity_stage.reordered', NEW],
    ]);
  });

  it('rejects an incomplete order and requires settings:update', async () => {
    const { uow, clock } = setup();
    const useCase = new ReorderOpportunityStages({ uow, clock });

    expect(unwrapErr(await useCase.execute({ stageIds: [NEW] }, ADMIN))).toEqual({
      type: 'InvalidOrder',
    });
    expect(unwrapErr(await useCase.execute({ stageIds: [NEW] }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('DeactivateOpportunityStage and ReactivateOpportunityStage', () => {
  async function withSecondNewStage(setupResult: ReturnType<typeof setup>) {
    const create = new CreateOpportunityStage(setupResult);
    return unwrap(
      await create.execute({ name: 'Sin seguimiento', color: '#000000', category: 'new' }, ADMIN),
    ).stageId;
  }

  it('deactivates a stage while its category keeps another, and reactivates it', async () => {
    const context = setup();
    await withSecondNewStage(context);
    const { uow, clock } = context;
    uow.audit.entries.splice(0);

    unwrap(await new DeactivateOpportunityStage({ uow, clock }).execute({ stageId: NEW }, ADMIN));
    expect(uow.stages.rows.get(NEW)?.isActive).toBe(false);
    unwrap(await new ReactivateOpportunityStage({ uow, clock }).execute({ stageId: NEW }, ADMIN));
    expect(uow.stages.rows.get(NEW)?.isActive).toBe(true);

    expect(uow.audit.entries.map((e) => [e.kind, e.action])).toEqual([
      ['action', 'opportunity_stage.deactivated'],
      ['action', 'opportunity_stage.reactivated'],
    ]);
  });

  it('keeps the last active stage of a category and the ones used by a rule', async () => {
    const context = setup();
    const { uow, clock } = context;
    const useCase = new DeactivateOpportunityStage({ uow, clock });

    expect(unwrapErr(await useCase.execute({ stageId: CONTACTED }, ADMIN))).toEqual({
      type: 'LastActiveStage',
      category: 'contacted',
    });

    const second = await withSecondNewStage(context);
    uow.opportunitySettings.rules = {
      ...uow.opportunitySettings.rules,
      onAssign: unwrap(parseId<'OpportunityStage'>(second)),
    };
    expect(unwrapErr(await useCase.execute({ stageId: second }, ADMIN))).toEqual({
      type: 'StageUsedByRule',
    });
  });

  it('fails for an unknown stage and without permission', async () => {
    const { uow, clock } = setup();

    for (const useCase of [
      new DeactivateOpportunityStage({ uow, clock }),
      new ReactivateOpportunityStage({ uow, clock }),
    ]) {
      expect(unwrapErr(await useCase.execute({ stageId: UNKNOWN_ID }, ADMIN))).toEqual({
        type: 'StageNotFound',
      });
      expect(unwrapErr(await useCase.execute({ stageId: NEW }, TEST_AGENT))).toEqual({
        type: 'Forbidden',
      });
    }
  });
});

describe('close reasons', () => {
  it('creates, updates and reorders reasons with their audit', async () => {
    const { uow, clock, ids } = setup();

    const { reasonId } = unwrap(
      await new CreateCloseReason({ uow, ids, clock }).execute(
        { name: 'Compró con otra inmobiliaria', rating: 'negative' },
        ADMIN,
      ),
    );
    unwrap(
      await new UpdateCloseReason({ uow, clock }).execute(
        { reasonId, name: 'Compró con otra inmobiliaria', rating: 'neutral' },
        ADMIN,
      ),
    );
    unwrap(
      await new ReorderCloseReasons({ uow, clock }).execute(
        { reasonIds: [reasonId, closeReasonFixtureId(0), closeReasonFixtureId(1)] },
        ADMIN,
      ),
    );

    expect(uow.closeReasons.rows.get(reasonId)).toMatchObject({ rating: 'neutral', position: 0 });
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'opportunity_close_reason.created',
      'opportunity_close_reason.updated',
      'opportunity_close_reason.reordered',
      'opportunity_close_reason.reordered',
      'opportunity_close_reason.reordered',
    ]);
    expect(uow.audit.entries[1]?.changes).toEqual({
      rating: { before: 'negative', after: 'neutral' },
    });
  });

  it('deactivates a reason but keeps the last active one', async () => {
    const { uow, clock } = setup();
    const deactivate = new DeactivateCloseReason({ uow, clock });

    unwrap(await deactivate.execute({ reasonId: closeReasonFixtureId(0) }, ADMIN));
    expect(
      unwrapErr(await deactivate.execute({ reasonId: closeReasonFixtureId(1) }, ADMIN)),
    ).toEqual({ type: 'LastActiveCloseReason' });
    unwrap(
      await new ReactivateCloseReason({ uow, clock }).execute(
        { reasonId: closeReasonFixtureId(0) },
        ADMIN,
      ),
    );

    expect(uow.closeReasons.rows.get(closeReasonFixtureId(0))?.isActive).toBe(true);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'opportunity_close_reason.deactivated',
      'opportunity_close_reason.reactivated',
    ]);
  });

  it('fails for an unknown reason and without permission', async () => {
    const { uow, clock, ids } = setup();

    expect(
      unwrapErr(
        await new UpdateCloseReason({ uow, clock }).execute(
          { reasonId: UNKNOWN_ID, name: 'X', rating: 'positive' },
          ADMIN,
        ),
      ),
    ).toEqual({ type: 'CloseReasonNotFound' });
    expect(
      unwrapErr(
        await new CreateCloseReason({ uow, ids, clock }).execute(
          { name: 'X', rating: 'positive' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await new DeactivateCloseReason({ uow, clock }).execute({ reasonId: UNKNOWN_ID }, ADMIN),
      ),
    ).toEqual({ type: 'CloseReasonNotFound' });
  });
});

describe('UpdateOpportunitySettings', () => {
  const noRules = { onCreate: null, onAssign: null, onReactivate: null, forOwners: null };

  it('saves the rules and audits the diff', async () => {
    const { uow, clock } = setup();
    const useCase = new UpdateOpportunitySettings({ uow, clock });

    unwrap(await useCase.execute({ ...noRules, onAssign: CONTACTED }, ADMIN));
    unwrap(await useCase.execute({ ...noRules, onAssign: CONTACTED }, ADMIN));

    expect(uow.opportunitySettings.rules.onAssign).toBe(CONTACTED);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'opportunity_settings.updated',
        changes: { onAssign: { before: null, after: CONTACTED } },
      }),
    ]);
  });

  it('rejects closed or unknown stages and requires settings:update', async () => {
    const { uow, clock } = setup();
    const useCase = new UpdateOpportunitySettings({ uow, clock });

    expect(unwrapErr(await useCase.execute({ ...noRules, forOwners: WON }, ADMIN))).toEqual({
      type: 'InvalidRuleStage',
      rule: 'forOwners',
    });
    expect(unwrapErr(await useCase.execute({ ...noRules, onCreate: UNKNOWN_ID }, ADMIN))).toEqual({
      type: 'InvalidRuleStage',
      rule: 'onCreate',
    });
    expect(unwrapErr(await useCase.execute(noRules, TEST_AGENT))).toEqual({ type: 'Forbidden' });
  });
});

describe('GetOpportunityConfiguration', () => {
  it('returns the stages, the reasons and the rules', async () => {
    const { uow } = setup();
    uow.opportunitySettings.rules = { ...uow.opportunitySettings.rules, onCreate: NEW };

    const config = unwrap(await new GetOpportunityConfiguration({ uow }).execute(ADMIN));

    expect(config.stages.map((s) => s.name)).toEqual(DEFAULT_STAGES.map((s) => s.name));
    expect(config.closeReasons).toHaveLength(2);
    expect(config.rules).toEqual({
      onCreate: NEW,
      onAssign: null,
      onReactivate: null,
      forOwners: null,
    });
  });

  it('requires settings:read or opportunities:read', async () => {
    const { uow } = setup();
    const useCase = new GetOpportunityConfiguration({ uow });

    expect(unwrapErr(await useCase.execute(TEST_AGENT))).toEqual({ type: 'Forbidden' });
    const agent = Actor.user('00000000-0000-7000-8000-0000000000a2', ['opportunities:read']);
    expect((await useCase.execute(agent)).isOk()).toBe(true);
  });
});
