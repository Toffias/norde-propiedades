import {
  CONDITIONS,
  Coordinates,
  CURRENCIES,
  DISPOSITIONS,
  OPERATIONS,
  ORIENTATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  Property,
  type CustomAttributeEntry,
  type PropertyId,
  type PropertyRepository,
} from '@norde/core/properties';
import { parseId, type IdGenerator, type Result } from '@norde/core/shared';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  properties,
  propertyAppraisers,
  propertyCustomAttributes,
  propertyCustomAttributeValues,
  propertyFeatures,
  propertyOperations,
  propertyPriceChanges,
  propertyTagAssignments,
} from '../db/schema';

// Columnas `text` de la base → uniones del core. Un valor fuera de catálogo falla fuerte.
const RowEnums = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
  orientation: z.enum(ORIENTATIONS).nullable(),
  condition: z.enum(CONDITIONS).nullable(),
  disposition: z.enum(DISPOSITIONS).nullable(),
});
const OperationEnums = z.object({
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
});

/** Tope de lectura de las etiquetas de una propiedad: más que esto no se muestra ni se filtra. */
const MAX_TAGS_PER_PROPERTY = 200;
/** Topes de las filas hijas: los mismos que aceptan los contracts de la ficha. */
const MAX_FEATURES_PER_PROPERTY = 200;
const MAX_APPRAISERS_PER_PROPERTY = 10;
const MAX_CUSTOM_VALUES_PER_PROPERTY = 50;

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the properties tables');
  return result.value;
}

/** La dirección exacta en una sola línea, para las columnas que todavía la leen (`address`). */
function fullStreet(street: string, streetNumber: string | undefined): string {
  return streetNumber === undefined ? street : `${street} ${streetNumber}`;
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

export class DrizzlePropertyRepository implements PropertyRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: PropertyId): Promise<Property | undefined> {
    const [row] = await this.db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return row ? this.restore(row) : undefined;
  }

  async findByCode(code: string): Promise<Property | undefined> {
    const [row] = await this.db.select().from(properties).where(eq(properties.code, code)).limit(1);
    return row ? this.restore(row) : undefined;
  }

  private async restore(row: typeof properties.$inferSelect): Promise<Property> {
    const id = row.id;
    // Una propiedad tiene como mucho una fila por operación (venta, alquiler, temporario).
    const operations = await this.db
      .select()
      .from(propertyOperations)
      .where(eq(propertyOperations.propertyId, id))
      .orderBy(asc(propertyOperations.createdAt), asc(propertyOperations.operation))
      .limit(OPERATIONS.length);
    // Las etiquetas de una propiedad son pocas: el catálogo entero entra en una pantalla.
    const tags = await this.db
      .select({ tagId: propertyTagAssignments.tagId })
      .from(propertyTagAssignments)
      .where(eq(propertyTagAssignments.propertyId, id))
      .orderBy(asc(propertyTagAssignments.tagId))
      .limit(MAX_TAGS_PER_PROPERTY);
    const featureRows = await this.db
      .select({ featureId: propertyFeatures.featureId })
      .from(propertyFeatures)
      .where(eq(propertyFeatures.propertyId, id))
      .orderBy(asc(propertyFeatures.featureId))
      .limit(MAX_FEATURES_PER_PROPERTY);
    const appraisers = await this.db
      .select({ userId: propertyAppraisers.userId })
      .from(propertyAppraisers)
      .where(eq(propertyAppraisers.propertyId, id))
      .orderBy(asc(propertyAppraisers.userId))
      .limit(MAX_APPRAISERS_PER_PROPERTY);
    const customValues = await this.db
      .select({
        attributeId: propertyCustomAttributeValues.attributeId,
        kind: propertyCustomAttributes.kind,
        valueText: propertyCustomAttributeValues.valueText,
        valueNumber: propertyCustomAttributeValues.valueNumber,
        valueBoolean: propertyCustomAttributeValues.valueBoolean,
      })
      .from(propertyCustomAttributeValues)
      .innerJoin(
        propertyCustomAttributes,
        eq(propertyCustomAttributes.id, propertyCustomAttributeValues.attributeId),
      )
      .where(eq(propertyCustomAttributeValues.propertyId, id))
      .orderBy(asc(propertyCustomAttributeValues.attributeId))
      .limit(MAX_CUSTOM_VALUES_PER_PROPERTY);

    const enums = RowEnums.parse(row);
    return Property.restore({
      id: stored(parseId<'Property'>(row.id)),
      code: row.code,
      slug: row.slug,
      kind: enums.propertyType,
      status: enums.status,
      address: {
        // Las propiedades cargadas antes del alta del panel no tienen la calle separada.
        street: row.street ?? row.address ?? '',
        streetNumber: optional(row.streetNumber),
        floor: optional(row.floor),
        unit: optional(row.unit),
        neighborhood: row.neighborhood,
        city: row.city,
        province: row.province,
      },
      publishAddress: row.publishAddress ?? '',
      portalTitle: row.portalTitle ?? row.title,
      coordinates:
        row.latitude === null || row.longitude === null
          ? undefined
          : stored(Coordinates.create(row.latitude, row.longitude)),
      locationId: optional(row.locationId),
      developmentId: optional(row.developmentId),
      operations: operations.map((operation) => ({
        ...OperationEnums.parse(operation),
        priceCents: optional(operation.priceCents),
        priceOnRequest: operation.priceOnRequest,
        commissionPct: optional(operation.commissionPct),
      })),
      tagIds: tags.map((tag) => tag.tagId),
      producerUserId: optional(row.producerUserId),
      branchId: optional(row.branchId),
      description: row.description,
      characteristics: {
        rooms: optional(row.rooms),
        bedrooms: optional(row.bedrooms),
        bathrooms: optional(row.bathrooms),
        toilets: optional(row.toilets),
        parkingSpaces: optional(row.parkingSpaces),
        ageYears: optional(row.ageYears),
        orientation: optional(enums.orientation),
        condition: optional(enums.condition),
        disposition: optional(enums.disposition),
        isFurnished: row.isFurnished,
        professionalUse: row.professionalUse,
        surfaceTotalM2: optional(row.surfaceTotalM2),
        surfaceCoveredM2: optional(row.surfaceCoveredM2),
        surfaceSemiCoveredM2: optional(row.surfaceSemiCoveredM2),
        surfaceLandM2: optional(row.surfaceLandM2),
        frontM: optional(row.frontM),
        depthM: optional(row.depthM),
      },
      deal: {
        isExclusive: row.isExclusive,
        acceptsSwap: row.acceptsSwap,
        immediateDeed: row.immediateDeed,
        hasFinancing: row.hasFinancing,
        creditEligible: row.creditEligible,
        expensesCents: optional(row.expensesCents),
      },
      featureIds: featureRows.map((feature) => feature.featureId),
      customAttributes: customValues.flatMap((value): CustomAttributeEntry[] => {
        const raw =
          value.kind === 'number'
            ? value.valueNumber
            : value.kind === 'boolean'
              ? value.valueBoolean
              : value.valueText;
        return raw === null ? [] : [{ attributeId: value.attributeId, value: raw }];
      }),
      internal: {
        maintenanceUserId: optional(row.maintenanceUserId),
        appraiserUserIds: appraisers.map((appraiser) => appraiser.userId),
        keysLocation: optional(row.keysLocation),
        legalInfo: optional(row.legalInfo),
        internalComments: optional(row.internalComments),
      },
      publication: {
        publishedOnWeb: row.publishedOnWeb,
        showPriceOnWeb: row.priceOnWeb,
        featured: row.featured,
        showExactAddress: row.showExactAddress,
      },
      statusChangedAt: row.statusChangedAt ?? row.createdAt,
      deletedAt: optional(row.deletedAt),
      deletedBy: optional(row.deletedBy),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * El alta inserta la fila completa; después, el upsert actualiza todo lo que modela el aggregate.
   * Las columnas que todavía no maneja (videos sueltos, columnas legacy de #33) no se pisan.
   */
  async save(property: Property, actorId: string): Promise<void> {
    const s = property.toSnapshot();
    const [first] = s.operations;
    const c = s.characteristics;
    const mutable = {
      code: s.code,
      title: s.portalTitle,
      portalTitle: s.portalTitle,
      description: s.description,
      status: s.status,
      statusChangedAt: s.statusChangedAt,
      address: fullStreet(s.address.street, s.address.streetNumber),
      street: s.address.street,
      streetNumber: s.address.streetNumber ?? null,
      floor: s.address.floor ?? null,
      unit: s.address.unit ?? null,
      publishAddress: s.publishAddress,
      neighborhood: s.address.neighborhood,
      city: s.address.city,
      province: s.address.province,
      locationId: s.locationId ?? null,
      developmentId: s.developmentId ?? null,
      latitude: s.coordinates?.latitude ?? null,
      longitude: s.coordinates?.longitude ?? null,
      rooms: c.rooms ?? null,
      bedrooms: c.bedrooms ?? null,
      bathrooms: c.bathrooms ?? null,
      toilets: c.toilets ?? null,
      parkingSpaces: c.parkingSpaces ?? null,
      ageYears: c.ageYears ?? null,
      orientation: c.orientation ?? null,
      condition: c.condition ?? null,
      disposition: c.disposition ?? null,
      isFurnished: c.isFurnished,
      professionalUse: c.professionalUse,
      surfaceTotalM2: c.surfaceTotalM2 ?? null,
      surfaceCoveredM2: c.surfaceCoveredM2 ?? null,
      surfaceSemiCoveredM2: c.surfaceSemiCoveredM2 ?? null,
      surfaceLandM2: c.surfaceLandM2 ?? null,
      frontM: c.frontM ?? null,
      depthM: c.depthM ?? null,
      isExclusive: s.deal.isExclusive,
      acceptsSwap: s.deal.acceptsSwap,
      immediateDeed: s.deal.immediateDeed,
      hasFinancing: s.deal.hasFinancing,
      creditEligible: s.deal.creditEligible,
      expensesCents: s.deal.expensesCents ?? null,
      maintenanceUserId: s.internal.maintenanceUserId ?? null,
      keysLocation: s.internal.keysLocation ?? null,
      legalInfo: s.internal.legalInfo ?? null,
      internalComments: s.internal.internalComments ?? null,
      publishedOnWeb: s.publication.publishedOnWeb,
      priceOnWeb: s.publication.showPriceOnWeb,
      featured: s.publication.featured,
      showExactAddress: s.publication.showExactAddress,
      producerUserId: s.producerUserId ?? null,
      branchId: s.branchId ?? null,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedBy ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(properties)
      .values({
        id: s.id,
        slug: s.slug,
        // Columnas legacy que todavía lee la búsqueda pública (#33): la primera operación del alta.
        operation: first?.operation ?? 'sale',
        currency: first?.currency ?? 'USD',
        priceCents: first?.priceCents ?? null,
        propertyType: s.kind,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...mutable,
      })
      .onConflictDoUpdate({ target: properties.id, set: mutable });

    await this.saveOperations(property, actorId);
    for (const change of property.priceChanges) {
      await this.db.insert(propertyPriceChanges).values({
        id: this.ids.next(),
        propertyId: s.id,
        operation: change.operation,
        oldPriceCents: change.oldPriceCents ?? null,
        newPriceCents: change.newPriceCents ?? null,
        currency: change.currency,
        changedBy: actorId,
        changedAt: change.changedAt,
      });
    }

    await this.saveTags(s.id, s.tagIds, s.updatedAt, actorId);
    await this.saveFeatures(s.id, s.featureIds, s.updatedAt, actorId);
    await this.saveAppraisers(s.id, s.internal.appraiserUserIds, s.updatedAt, actorId);
    await this.saveCustomAttributes(s.id, s.customAttributes, s.updatedAt, actorId);
  }

  /** Upsert de cada operación y baja de las que se quitaron. */
  private async saveOperations(property: Property, actorId: string): Promise<void> {
    const s = property.toSnapshot();
    for (const operation of s.operations) {
      const values = {
        currency: operation.currency,
        priceCents: operation.priceCents ?? null,
        priceOnRequest: operation.priceOnRequest,
        commissionPct: operation.commissionPct ?? null,
        updatedAt: s.updatedAt,
        updatedBy: actorId,
      };
      await this.db
        .insert(propertyOperations)
        .values({
          id: this.ids.next(),
          propertyId: s.id,
          operation: operation.operation,
          // Una operación que se suma después del alta va última: la ficha las ordena por alta.
          createdAt: s.updatedAt,
          createdBy: actorId,
          ...values,
        })
        .onConflictDoUpdate({
          target: [propertyOperations.propertyId, propertyOperations.operation],
          set: values,
        });
    }
    await this.db.delete(propertyOperations).where(
      and(
        eq(propertyOperations.propertyId, s.id),
        notInArray(
          propertyOperations.operation,
          s.operations.map((operation) => operation.operation),
        ),
      ),
    );
  }

  /** Las etiquetas son filas de vínculo: se insertan las nuevas y se borran las que se quitaron. */
  private async saveTags(
    propertyId: string,
    tagIds: readonly string[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const current = await this.db
      .select({ tagId: propertyTagAssignments.tagId })
      .from(propertyTagAssignments)
      .where(eq(propertyTagAssignments.propertyId, propertyId))
      .limit(MAX_TAGS_PER_PROPERTY);
    const { added, removed } = linkDiff(
      current.map((row) => row.tagId),
      tagIds,
    );
    if (removed.length > 0) {
      await this.db
        .delete(propertyTagAssignments)
        .where(
          and(
            eq(propertyTagAssignments.propertyId, propertyId),
            inArray(propertyTagAssignments.tagId, [...removed]),
          ),
        );
    }
    if (added.length > 0) {
      await this.db
        .insert(propertyTagAssignments)
        .values(added.map((tagId) => ({ propertyId, tagId, createdAt: now, createdBy: actorId })))
        .onConflictDoNothing();
    }
  }

  private async saveFeatures(
    propertyId: string,
    featureIds: readonly string[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const current = await this.db
      .select({ featureId: propertyFeatures.featureId })
      .from(propertyFeatures)
      .where(eq(propertyFeatures.propertyId, propertyId))
      .limit(MAX_FEATURES_PER_PROPERTY);
    const { added, removed } = linkDiff(
      current.map((row) => row.featureId),
      featureIds,
    );
    if (removed.length > 0) {
      await this.db
        .delete(propertyFeatures)
        .where(
          and(
            eq(propertyFeatures.propertyId, propertyId),
            inArray(propertyFeatures.featureId, [...removed]),
          ),
        );
    }
    if (added.length > 0) {
      await this.db
        .insert(propertyFeatures)
        .values(
          added.map((featureId) => ({ propertyId, featureId, createdAt: now, createdBy: actorId })),
        )
        .onConflictDoNothing();
    }
  }

  private async saveAppraisers(
    propertyId: string,
    userIds: readonly string[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const current = await this.db
      .select({ userId: propertyAppraisers.userId })
      .from(propertyAppraisers)
      .where(eq(propertyAppraisers.propertyId, propertyId))
      .limit(MAX_APPRAISERS_PER_PROPERTY);
    const { added, removed } = linkDiff(
      current.map((row) => row.userId),
      userIds,
    );
    if (removed.length > 0) {
      await this.db
        .delete(propertyAppraisers)
        .where(
          and(
            eq(propertyAppraisers.propertyId, propertyId),
            inArray(propertyAppraisers.userId, [...removed]),
          ),
        );
    }
    if (added.length > 0) {
      await this.db
        .insert(propertyAppraisers)
        .values(added.map((userId) => ({ propertyId, userId, createdAt: now, createdBy: actorId })))
        .onConflictDoNothing();
    }
  }

  /** Un valor por atributo, en la columna de su tipo (ADR 0014). */
  private async saveCustomAttributes(
    propertyId: string,
    entries: readonly CustomAttributeEntry[],
    now: Date,
    actorId: string,
  ): Promise<void> {
    const kept = entries.map((entry) => entry.attributeId);
    await this.db
      .delete(propertyCustomAttributeValues)
      .where(
        kept.length === 0
          ? eq(propertyCustomAttributeValues.propertyId, propertyId)
          : and(
              eq(propertyCustomAttributeValues.propertyId, propertyId),
              notInArray(propertyCustomAttributeValues.attributeId, kept),
            ),
      );
    for (const entry of entries) {
      const values = {
        valueText: typeof entry.value === 'string' ? entry.value : null,
        valueNumber: typeof entry.value === 'number' ? entry.value : null,
        valueBoolean: typeof entry.value === 'boolean' ? entry.value : null,
        updatedAt: now,
        updatedBy: actorId,
      };
      await this.db
        .insert(propertyCustomAttributeValues)
        .values({
          propertyId,
          attributeId: entry.attributeId,
          createdAt: now,
          createdBy: actorId,
          ...values,
        })
        .onConflictDoUpdate({
          target: [
            propertyCustomAttributeValues.propertyId,
            propertyCustomAttributeValues.attributeId,
          ],
          set: values,
        });
    }
  }
}
