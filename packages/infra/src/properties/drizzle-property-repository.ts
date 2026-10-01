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
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { properties, propertyOperations } from '../db/schema';

// Columnas `text` de la base → uniones del core. Un valor fuera de catálogo falla fuerte.
const RowEnums = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
});
const OperationEnums = z.object({
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
});

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
      operations: operations.map((operation) => ({
        ...OperationEnums.parse(operation),
        priceCents: operation.priceCents ?? undefined,
      })),
      producerUserId: row.producerUserId ?? undefined,
      branchId: row.branchId ?? undefined,
      deletedAt: row.deletedAt ?? undefined,
      deletedBy: row.deletedBy ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * El alta inserta la fila completa. Después, el aggregate solo cambia la papelera: el upsert
   * actualiza esas columnas y no pisa lo que se edita en la ficha (#6).
   */
  async save(property: Property, actorId: string): Promise<void> {
    const s = property.toSnapshot();
    const [first] = s.operations;
    const trashColumns = {
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
        // Columnas legacy que todavía lee la búsqueda pública: la primera operación del alta.
        operation: first?.operation ?? 'sale',
        currency: first?.currency ?? 'USD',
        priceCents: first?.priceCents ?? null,
        propertyType: s.kind,
        status: s.status,
        statusChangedAt: s.createdAt,
        address: fullStreet(s.address.street, s.address.streetNumber),
        street: s.address.street,
        streetNumber: s.address.streetNumber ?? null,
        floor: s.address.floor ?? null,
        unit: s.address.unit ?? null,
        publishAddress: s.publishAddress,
        neighborhood: s.address.neighborhood,
        city: s.address.city,
        province: s.address.province,
        latitude: s.coordinates?.latitude ?? null,
        longitude: s.coordinates?.longitude ?? null,
        portalTitle: s.portalTitle,
        producerUserId: s.producerUserId ?? null,
        branchId: s.branchId ?? null,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...trashColumns,
      })
      .onConflictDoUpdate({ target: properties.id, set: trashColumns });

    // Las operaciones nacen con el alta; editarlas es de la ficha (#6). Las que ya existen no se tocan.
    for (const operation of s.operations) {
      await this.db
        .insert(propertyOperations)
        .values({
          id: this.ids.next(),
          propertyId: s.id,
          operation: operation.operation,
          currency: operation.currency,
          priceCents: operation.priceCents ?? null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .onConflictDoNothing({
          target: [propertyOperations.propertyId, propertyOperations.operation],
        });
    }
  }
}
