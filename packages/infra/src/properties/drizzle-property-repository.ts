import {
  Coordinates,
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  Property,
  type PropertyId,
  type PropertyRepository,
} from '@norde/core/properties';
import { parseId, type IdGenerator, type Result } from '@norde/core/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  properties,
  propertyOperations,
  propertyPriceChanges,
  propertyTagAssignments,
} from '../db/schema';

// Columnas `text` de la base → uniones del core. Un valor fuera de catálogo falla fuerte.
const RowEnums = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
});
const OperationEnums = z.object({
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
});

/** Tope de lectura de las etiquetas de una propiedad: más que esto no se muestra ni se filtra. */
const MAX_TAGS_PER_PROPERTY = 200;

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the properties tables');
  return result.value;
}

/** La dirección exacta en una sola línea, para las columnas que todavía la leen (`address`). */
function fullStreet(street: string, streetNumber: string | undefined): string {
  return streetNumber === undefined ? street : `${street} ${streetNumber}`;
}

export class DrizzlePropertyRepository implements PropertyRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: PropertyId): Promise<Property | undefined> {
    const [row] = await this.db.select().from(properties).where(eq(properties.id, id)).limit(1);
    if (!row) return undefined;
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
        streetNumber: row.streetNumber ?? undefined,
        floor: row.floor ?? undefined,
        unit: row.unit ?? undefined,
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
      locationId: row.locationId ?? undefined,
      operations: operations.map((operation) => ({
        ...OperationEnums.parse(operation),
        priceCents: operation.priceCents ?? undefined,
      })),
      tagIds: tags.map((tag) => tag.tagId),
      producerUserId: row.producerUserId ?? undefined,
      branchId: row.branchId ?? undefined,
      statusChangedAt: row.statusChangedAt ?? row.createdAt,
      deletedAt: row.deletedAt ?? undefined,
      deletedBy: row.deletedBy ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * El alta inserta la fila completa. Después, el aggregate cambia el estado, el captador, la
   * papelera, los precios y las etiquetas: el upsert actualiza esas columnas y no pisa lo que se
   * edita en la ficha (#6).
   */
  async save(property: Property, actorId: string): Promise<void> {
    const s = property.toSnapshot();
    const [first] = s.operations;
    const mutable = {
      status: s.status,
      statusChangedAt: s.statusChangedAt,
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
        code: s.code,
        slug: s.slug,
        title: s.portalTitle,
        // Columnas legacy que todavía lee la búsqueda pública (#33): la primera operación del alta.
        operation: first?.operation ?? 'sale',
        currency: first?.currency ?? 'USD',
        priceCents: first?.priceCents ?? null,
        propertyType: s.kind,
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
        latitude: s.coordinates?.latitude ?? null,
        longitude: s.coordinates?.longitude ?? null,
        portalTitle: s.portalTitle,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...mutable,
      })
      .onConflictDoUpdate({ target: properties.id, set: mutable });

    for (const operation of s.operations) {
      const price = {
        currency: operation.currency,
        priceCents: operation.priceCents ?? null,
        updatedAt: s.updatedAt,
        updatedBy: actorId,
      };
      await this.db
        .insert(propertyOperations)
        .values({
          id: this.ids.next(),
          propertyId: s.id,
          operation: operation.operation,
          createdAt: s.createdAt,
          createdBy: actorId,
          ...price,
        })
        .onConflictDoUpdate({
          target: [propertyOperations.propertyId, propertyOperations.operation],
          set: price,
        });
    }

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
    const before = new Set(current.map((row) => row.tagId));
    const after = new Set(tagIds);
    const removed = [...before].filter((id) => !after.has(id));
    const added = [...after].filter((id) => !before.has(id));
    if (removed.length > 0) {
      await this.db
        .delete(propertyTagAssignments)
        .where(
          and(
            eq(propertyTagAssignments.propertyId, propertyId),
            inArray(propertyTagAssignments.tagId, removed),
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
}
