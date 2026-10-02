import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CreateCloseReason,
  CreateOpportunityStage,
  DeactivateOpportunityStage,
  GetOpportunityConfiguration,
  RegisterContact,
  ReorderOpportunityStages,
  UpdateOpportunitySettings,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { SEEDED_STAGES, useTestDatabase } from '../../test/database';
import {
  auditLog,
  clients,
  opportunities,
  opportunityCloseReasons,
  opportunitySettings,
  opportunityStages,
  opportunityStatusChanges,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const admin = Actor.user('01920000-0000-7000-8000-0000000000a1', ['settings:*']);
const agent = Actor.system('agent-ia', ['clients:create']);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function registerAna() {
  return unwrap(
    await new RegisterContact({ uow, ids, clock }).execute(
      {
        channel: 'whatsapp',
        channelExternalId: '5491166899124',
        phone: '+5491166899124',
        name: 'Ana',
        opportunity: { type: 'rent', intent: 'visit' },
      },
      agent,
    ),
  );
}

describe('opportunity stages persistence', () => {
  it('opens a registered opportunity in its stage and writes the first history entry', async () => {
    const { opportunityId } = await registerAna();

    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    expect(row).toMatchObject({
      status: 'new',
      stageId: SEEDED_STAGES.new,
      statusChangedAt: clock.now(),
      createdBy: 'system:agent-ia',
      updatedBy: 'system:agent-ia',
    });
    expect(await db.select().from(opportunityStatusChanges)).toMatchObject([
      {
        opportunityId,
        fromStageId: null,
        fromStatus: null,
        toStageId: SEEDED_STAGES.new,
        toStatus: 'new',
        changedBy: 'system:agent-ia',
        changedAt: clock.now(),
      },
    ]);
  });

  it('creates, reorders and deactivates stages through the use cases', async () => {
    // "Nuevo" lo usa la regla "al crear": se desactiva el estado nuevo de su misma categoría.
    const { stageId } = unwrap(
      await new CreateOpportunityStage({ uow, ids, clock }).execute(
        { name: 'Sin seguimiento', color: '#EF4444', category: 'new' },
        admin,
      ),
    );
    const order = [stageId, ...Object.values(SEEDED_STAGES)];
    unwrap(await new ReorderOpportunityStages({ uow, clock }).execute({ stageIds: order }, admin));
    unwrap(await new DeactivateOpportunityStage({ uow, clock }).execute({ stageId }, admin));

    const rows = await db
      .select({ id: opportunityStages.id, position: opportunityStages.position })
      .from(opportunityStages)
      .orderBy(asc(opportunityStages.position));
    expect(rows.map((r) => r.id)).toEqual(order);
    const [created] = await db
      .select()
      .from(opportunityStages)
      .where(eq(opportunityStages.id, stageId));
    expect(created).toMatchObject({
      color: '#ef4444',
      category: 'new',
      createdBy: admin.id,
      updatedBy: admin.id,
    });

    const config = unwrap(await new GetOpportunityConfiguration({ uow }).execute(admin));
    expect(config.stages.map((s) => [s.id, s.isActive])).toEqual(
      order.map((id) => [id, id !== stageId]),
    );
    expect(
      (await db.select({ action: auditLog.action }).from(auditLog)).map((e) => e.action).sort(),
    ).toEqual(
      [
        'opportunity_stage.created',
        'opportunity_stage.deactivated',
        ...order.map(() => 'opportunity_stage.reordered'),
      ].sort(),
    );
  });

  it('saves the rules and the close reasons', async () => {
    unwrap(
      await new UpdateOpportunitySettings({ uow, clock }).execute(
        {
          onCreate: SEEDED_STAGES.new,
          onAssign: SEEDED_STAGES.contacted,
          onReactivate: null,
          forOwners: null,
        },
        admin,
      ),
    );
    const { reasonId } = unwrap(
      await new CreateCloseReason({ uow, ids, clock }).execute(
        { name: 'Compró con nosotros', rating: 'positive' },
        admin,
      ),
    );

    expect(await db.select().from(opportunitySettings)).toMatchObject([
      {
        stageOnCreateId: SEEDED_STAGES.new,
        stageOnAssignId: SEEDED_STAGES.contacted,
        stageOnReactivateId: null,
        updatedBy: admin.id,
      },
    ]);
    expect(await db.select().from(opportunityCloseReasons)).toMatchObject([
      { id: reasonId, rating: 'positive', position: 0, isActive: true },
    ]);
    const config = unwrap(await new GetOpportunityConfiguration({ uow }).execute(admin));
    expect(config.rules).toEqual({
      onCreate: SEEDED_STAGES.new,
      onAssign: SEEDED_STAGES.contacted,
      onReactivate: null,
      forOwners: null,
    });
  });

  it('backfills the stage, the agent and the history of older opportunities', async () => {
    const { clientId, opportunityId } = await registerAna();
    await db
      .update(clients)
      .set({
        agentId: '01920000-0000-7000-8000-0000000000c1',
        branchId: '01920000-0000-7000-8000-0000000000b1',
      })
      .where(eq(clients.id, clientId));
    // Como quedaron las oportunidades antes de los estados editables.
    await db
      .update(opportunities)
      .set({
        status: 'visiting',
        stageId: null,
        agentId: null,
        branchId: null,
        statusChangedAt: null,
      })
      .where(eq(opportunities.id, opportunityId));
    await db.delete(opportunityStatusChanges);

    const migration = readFileSync(
      path.join(import.meta.dirname, '../db/migrations/0016_opportunity_stages.sql'),
      'utf8',
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      await db.execute(sql.raw(statement));
    }

    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    expect(row).toMatchObject({
      stageId: SEEDED_STAGES.visiting,
      agentId: '01920000-0000-7000-8000-0000000000c1',
      branchId: '01920000-0000-7000-8000-0000000000b1',
      statusChangedAt: row?.updatedAt,
    });
    expect(await db.select().from(opportunityStatusChanges)).toMatchObject([
      { opportunityId, toStageId: SEEDED_STAGES.visiting, toStatus: 'visiting' },
    ]);
    // Idempotente: una segunda pasada no duplica nada.
    for (const statement of migration.split('--> statement-breakpoint')) {
      await db.execute(sql.raw(statement));
    }
    expect(await db.select().from(opportunityStatusChanges)).toHaveLength(1);
  });
});
