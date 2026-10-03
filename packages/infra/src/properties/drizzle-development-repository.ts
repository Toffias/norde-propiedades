import {
  CONSTRUCTION_STATUSES,
  Coordinates,
  Development,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_STATUSES,
  type DevelopmentId,
  type DevelopmentRepository,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  developmentFeatures,
  developments,
  developmentTagAssignments,
  properties,
} from '../db/schema';

// Columnas `text` de la base → uniones del core. Un valor fuera de catálogo falla fuerte.
const RowEnums = z.object({
  developmentType: z.enum(DEVELOPMENT_KINDS).nullable(),
  status: z.enum(DEVELOPMENT_STATUSES),
  constructionStatus: z.enum(CONSTRUCTION_STATUSES).nullable(),
});

/** Topes de las filas hijas: los mismos que aceptan los contracts de la ficha. */
const MAX_FEATURES_PER_DEVELOPMENT = 200;
const MAX_TAGS_PER_DEVELOPMENT = 200;

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the developments table');
  return result.value;
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

/** Qué vínculos agregar y cuáles quitar para pasar de `before` a `after`. */
function linkDiff(
  before: readonly string[],
  after: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const was = new Set(before);
  const will = new Set(after);
  return {
    added: [...will].filter((id) => !was.has(id)),
    removed: [...was].filter((id) => !will.has(id)),
  };
}

export class DrizzleDevelopmentRepository implements DevelopmentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: DevelopmentId): Promise<Development | undefined> {
    const [row] = await this.db.select().from(developments).where(eq(developments.id, id)).limit(1);
    return row ? this.restore(row) : undefined;
  }

  /** Por `properties_development_idx`. */
  async countActiveUnits(id: DevelopmentId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(properties)
      .where(and(eq(properties.developmentId, id), isNull(properties.deletedAt)));
    return row?.total ?? 0;
  }

  private async restore(row: typeof developments.$inferSelect): Promise<Development> {
    const featureRows = await this.db
      .select({ featureId: developmentFeatures.featureId })
      .from(developmentFeatures)
      .where(eq(developmentFeatures.developmentId, row.id))
      .orderBy(asc(developmentFeatures.featureId))
      .limit(MAX_FEATURES_PER_DEVELOPMENT);
    const tagRows = await this.db
      .select({ tagId: developmentTagAssignments.tagId })
      .from(developmentTagAssignments)
      .where(eq(developmentTagAssignments.developmentId, row.id))
      .orderBy(asc(developmentTagAssignments.tagId))
      .limit(MAX_TAGS_PER_DEVELOPMENT);

    const enums = RowEnums.parse(row);
    return Development.restore({
      id: stored(parseId<'Development'>(row.id)),
      code: row.code,
      slug: row.slug,
      name: row.name,
      kind: optional(enums.developmentType),
      status: enums.status,
      constructionStatus: optional(enums.constructionStatus),
      deliveryDate: optional(row.deliveryDate),
      privateAddress: row.privateAddress ?? '',
      publishAddress: row.publishAddress ?? '',
      portalTitle: row.portalTitle ?? row.name,
      locationId: optional(row.locationId),
      coordinates:
        row.latitude === null || row.longitude === null
          ? undefined
          : stored(Coordinates.create(row.latitude, row.longitude)),
      developerName: optional(row.developerName),
      commercialContactClientId: optional(row.commercialContactClientId),
      websiteUrl: optional(row.websiteUrl),
      description: row.description,
      financingDetails: optional(row.financingDetails),
      deal: {
        isFinanced: row.isFinanced,
        acceptsSwap: row.acceptsSwap,
        immediateDeed: row.immediateDeed,
      },
      featureIds: featureRows.map((feature) => feature.featureId),
      tagIds: tagRows.map((tag) => tag.tagId),
      producerUserId: optional(row.producerUserId),
      branchId: optional(row.branchId),
      deletedAt: optional(row.deletedAt),
      deletedBy: optional(row.deletedBy),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * El alta inserta la fila completa; después, el upsert actualiza todo lo que modela el aggregate.
   * Lo que todavía no maneja (publicar en web, destacado) no se pisa.
   */
  async save(development: Development, actorId: string): Promise<void> {
    const s = development.toSnapshot();
    const mutable = {
      code: s.code,
      name: s.name,
      developmentType: s.kind ?? null,
      status: s.status,
      constructionStatus: s.constructionStatus ?? null,
      deliveryDate: s.deliveryDate ?? null,
      privateAddress: s.privateAddress,
      publishAddress: s.publishAddress,
      portalTitle: s.portalTitle,
      locationId: s.locationId ?? null,
      latitude: s.coordinates?.latitude ?? null,
      longitude: s.coordinates?.longitude ?? null,
      developerName: s.developerName ?? null,
      commercialContactClientId: s.commercialContactClientId ?? null,
      websiteUrl: s.websiteUrl ?? null,
      description: s.description,
      financingDetails: s.financingDetails ?? null,
      isFinanced: s.deal.isFinanced,
      acceptsSwap: s.deal.acceptsSwap,
      immediateDeed: s.deal.immediateDeed,
      producerUserId: s.producerUserId ?? null,
      branchId: s.branchId ?? null,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedBy ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(developments)
      .values({
        id: s.id,
        slug: s.slug,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...mutable,
      })
      .onConflictDoUpdate({ target: developments.id, set: mutable });

    await this.saveFeatures(s.id, s.featureIds, s.updatedAt, actorId);
    await this.saveTags(s.id, s.tagIds, s.updatedAt, actorId);
  }

  private async saveFeatures(
    developmentId: string,
    featureIds: readonly string[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const current = await this.db
      .select({ featureId: developmentFeatures.featureId })
      .from(developmentFeatures)
      .where(eq(developmentFeatures.developmentId, developmentId))
      .limit(MAX_FEATURES_PER_DEVELOPMENT);
    const { added, removed } = linkDiff(
      current.map((row) => row.featureId),
      featureIds,
    );
    if (removed.length > 0) {
      await this.db
        .delete(developmentFeatures)
        .where(
          and(
            eq(developmentFeatures.developmentId, developmentId),
            inArray(developmentFeatures.featureId, [...removed]),
          ),
        );
    }
    if (added.length > 0) {
      await this.db
        .insert(developmentFeatures)
        .values(
          added.map((featureId) => ({
            developmentId,
            featureId,
            createdAt: now,
            createdBy: actorId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  private async saveTags(
    developmentId: string,
    tagIds: readonly string[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const current = await this.db
      .select({ tagId: developmentTagAssignments.tagId })
      .from(developmentTagAssignments)
      .where(eq(developmentTagAssignments.developmentId, developmentId))
      .limit(MAX_TAGS_PER_DEVELOPMENT);
    const { added, removed } = linkDiff(
      current.map((row) => row.tagId),
      tagIds,
    );
    if (removed.length > 0) {
      await this.db
        .delete(developmentTagAssignments)
        .where(
          and(
            eq(developmentTagAssignments.developmentId, developmentId),
            inArray(developmentTagAssignments.tagId, [...removed]),
          ),
        );
    }
    if (added.length > 0) {
      await this.db
        .insert(developmentTagAssignments)
        .values(
          added.map((tagId) => ({ developmentId, tagId, createdAt: now, createdBy: actorId })),
        )
        .onConflictDoNothing();
    }
  }
}
