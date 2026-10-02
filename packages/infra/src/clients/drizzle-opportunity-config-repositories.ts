import {
  CLOSE_REASON_RATINGS,
  MAX_CLOSE_REASONS,
  MAX_OPPORTUNITY_STAGES,
  NO_RULES,
  OPPORTUNITY_STATUSES,
  OpportunityCloseReason,
  OpportunityStage,
  type OpportunityCloseReasonId,
  type OpportunityCloseReasonRepository,
  type OpportunityRules,
  type OpportunitySettingsRepository,
  type OpportunityStageId,
  type OpportunityStageRepository,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { opportunityCloseReasons, opportunitySettings, opportunityStages } from '../db/schema';

const CategorySchema = z.enum(OPPORTUNITY_STATUSES);
const RatingSchema = z.enum(CLOSE_REASON_RATINGS);

/** IDs leídos de la base: si uno no es válido, la fila está corrupta. */
function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

function toStage(row: typeof opportunityStages.$inferSelect): OpportunityStage {
  return OpportunityStage.restore({
    id: storedId<'OpportunityStage'>(row.id),
    name: row.name,
    color: row.color,
    position: row.position,
    category: CategorySchema.parse(row.category),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleOpportunityStageRepository implements OpportunityStageRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: OpportunityStageId) {
    const [row] = await this.db
      .select()
      .from(opportunityStages)
      .where(eq(opportunityStages.id, id))
      .limit(1);
    return row && toStage(row);
  }

  async findAll() {
    // El dominio no deja crear más de MAX_OPPORTUNITY_STAGES: el límite es el tope del catálogo.
    const rows = await this.db
      .select()
      .from(opportunityStages)
      .orderBy(asc(opportunityStages.position), asc(opportunityStages.id))
      .limit(MAX_OPPORTUNITY_STAGES);
    return rows.map(toStage);
  }

  async save(stage: OpportunityStage, actorId: string): Promise<void> {
    const s = stage.toSnapshot();
    const values = {
      name: s.name,
      color: s.color,
      position: s.position,
      isActive: s.isActive,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(opportunityStages)
      .values({
        id: s.id,
        category: s.category,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: opportunityStages.id, set: values });
  }
}

function toCloseReason(row: typeof opportunityCloseReasons.$inferSelect): OpportunityCloseReason {
  return OpportunityCloseReason.restore({
    id: storedId<'OpportunityCloseReason'>(row.id),
    name: row.name,
    rating: RatingSchema.parse(row.rating),
    position: row.position,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleOpportunityCloseReasonRepository implements OpportunityCloseReasonRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: OpportunityCloseReasonId) {
    const [row] = await this.db
      .select()
      .from(opportunityCloseReasons)
      .where(eq(opportunityCloseReasons.id, id))
      .limit(1);
    return row && toCloseReason(row);
  }

  async findAll() {
    // El dominio no deja crear más de MAX_CLOSE_REASONS: el límite es el tope del catálogo.
    const rows = await this.db
      .select()
      .from(opportunityCloseReasons)
      .orderBy(asc(opportunityCloseReasons.position), asc(opportunityCloseReasons.id))
      .limit(MAX_CLOSE_REASONS);
    return rows.map(toCloseReason);
  }

  async save(reason: OpportunityCloseReason, actorId: string): Promise<void> {
    const s = reason.toSnapshot();
    const values = {
      name: s.name,
      rating: s.rating,
      position: s.position,
      isActive: s.isActive,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(opportunityCloseReasons)
      .values({ id: s.id, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: opportunityCloseReasons.id, set: values });
  }
}

function stageIdOrUndefined(value: string | null): OpportunityStageId | undefined {
  return value === null ? undefined : storedId<'OpportunityStage'>(value);
}

/** Fila única (la crea la migración `0001`). */
export class DrizzleOpportunitySettingsRepository implements OpportunitySettingsRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(): Promise<OpportunityRules> {
    const [row] = await this.db.select().from(opportunitySettings).limit(1);
    if (!row) return NO_RULES;
    return {
      onCreate: stageIdOrUndefined(row.stageOnCreateId),
      onAssign: stageIdOrUndefined(row.stageOnAssignId),
      onReactivate: stageIdOrUndefined(row.stageOnReactivateId),
      forOwners: stageIdOrUndefined(row.stageForOwnersId),
    };
  }

  async save(rules: OpportunityRules, actorId: string, now: Date): Promise<void> {
    const values = {
      stageOnCreateId: rules.onCreate ?? null,
      stageOnAssignId: rules.onAssign ?? null,
      stageOnReactivateId: rules.onReactivate ?? null,
      stageForOwnersId: rules.forOwners ?? null,
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.db
      .insert(opportunitySettings)
      .values({ id: true, createdAt: now, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: opportunitySettings.id, set: values });
  }
}
