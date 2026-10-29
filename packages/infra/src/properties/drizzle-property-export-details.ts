import type { PropertyExportDetails, PropertyExportDetailsQuery } from '@norde/core/properties';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import {
  branches,
  clientPhones,
  clients,
  developments,
  properties,
  propertyOwners,
  users,
} from '../db/schema';

type Owner = NonNullable<PropertyExportDetails['owner']>;

/** Calle, número, piso y unidad, como se escribe una dirección ("Gurruchaga 1850 3 B"). */
function privateAddress(row: {
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly floor: string | null;
  readonly unit: string | null;
  readonly address: string | null;
}): string | undefined {
  const parts = [row.street, row.streetNumber, row.floor, row.unit].filter(
    (part): part is string => part !== null && part.trim() !== '',
  );
  if (parts.length > 0) return parts.join(' ');
  return row.address ?? undefined;
}

/**
 * Las columnas de la planilla de propiedades que no están en el buscador, para un lote: dos
 * consultas, una por las propiedades (con usuario de mantenimiento, sucursal y emprendimiento) y
 * otra por el primer propietario de cada una. Lee de identity y clients solo para mostrar nombres y
 * contactos, como el resto de los listados.
 */
export class DrizzlePropertyExportDetails implements PropertyExportDetailsQuery {
  constructor(private readonly db: DbExecutor) {}

  async details(
    propertyIds: readonly string[],
    options: { readonly includeOwners: boolean },
  ): Promise<ReadonlyMap<string, PropertyExportDetails>> {
    if (propertyIds.length === 0) return new Map();
    const ids = [...propertyIds];
    const [rows, owners] = await Promise.all([
      this.db
        .select({
          id: properties.id,
          address: properties.address,
          street: properties.street,
          streetNumber: properties.streetNumber,
          floor: properties.floor,
          unit: properties.unit,
          toilets: properties.toilets,
          surfaceSemiCoveredM2: properties.surfaceSemiCoveredM2,
          surfaceLandM2: properties.surfaceLandM2,
          frontM: properties.frontM,
          depthM: properties.depthM,
          expensesCents: properties.expensesCents,
          maintenanceUser: users.name,
          branch: branches.name,
          development: developments.name,
        })
        .from(properties)
        .leftJoin(users, eq(users.id, properties.maintenanceUserId))
        .leftJoin(branches, eq(branches.id, properties.branchId))
        .leftJoin(developments, eq(developments.id, properties.developmentId))
        .where(inArray(properties.id, ids)),
      options.includeOwners ? this.firstOwners(ids) : Promise.resolve(new Map<string, Owner>()),
    ]);

    return new Map(
      rows.map((row): [string, PropertyExportDetails] => [
        row.id,
        {
          address: privateAddress(row),
          toilets: row.toilets ?? undefined,
          surfaceSemiCoveredM2: row.surfaceSemiCoveredM2 ?? undefined,
          surfaceLandM2: row.surfaceLandM2 ?? undefined,
          frontM: row.frontM ?? undefined,
          depthM: row.depthM ?? undefined,
          expensesCents: row.expensesCents ?? undefined,
          maintenanceUser: row.maintenanceUser ?? undefined,
          branch: row.branch ?? undefined,
          development: row.development ?? undefined,
          owner: owners.get(row.id),
        },
      ]),
    );
  }

  /**
   * El primer propietario cargado de cada propiedad (por `property_owners_client_idx` y la clave
   * primaria), sin los que están en la papelera o unificados con otro contacto.
   */
  private async firstOwners(propertyIds: string[]): Promise<Map<string, Owner>> {
    const rows = await this.db
      .selectDistinctOn([propertyOwners.propertyId], {
        propertyId: propertyOwners.propertyId,
        name: clients.name,
        companyName: clients.companyName,
        email: clients.email,
        phone: clients.phoneE164,
        mobile: sql<string | null>`(
          select ${clientPhones.phoneE164} from ${clientPhones}
          where ${clientPhones.clientId} = ${clients.id} and ${clientPhones.kind} = 'mobile'
          order by ${clientPhones.position} asc
          limit 1
        )`,
      })
      .from(propertyOwners)
      .innerJoin(
        clients,
        and(
          eq(clients.id, propertyOwners.clientId),
          isNull(clients.deletedAt),
          isNull(clients.mergedIntoId),
        ),
      )
      .where(inArray(propertyOwners.propertyId, propertyIds))
      .orderBy(propertyOwners.propertyId, asc(propertyOwners.createdAt), asc(clients.id));
    return new Map(
      rows.map((row) => [
        row.propertyId,
        {
          name: row.name ?? row.companyName ?? 'Sin nombre',
          email: row.email ?? undefined,
          mobile: row.mobile ?? row.phone ?? undefined,
        },
      ]),
    );
  }
}
