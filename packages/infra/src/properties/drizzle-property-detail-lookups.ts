import {
  CUSTOM_ATTRIBUTE_KINDS,
  LOCATION_KINDS,
  type PanelPropertyCustomAttribute,
  type PropertyDetailLookups,
  type PropertyLocationLevel,
} from '@norde/core/properties';
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  attachments,
  clients,
  developments,
  features,
  locations,
  mediaItems,
  properties,
  propertyCustomAttributes,
  propertyOwners,
  propertyTagGroups,
  propertyTags,
} from '../db/schema';

/** Atributos personalizados por propiedad: los mismos que acepta el contract de la ficha. */
const MAX_CUSTOM_ATTRIBUTES = 50;
/** Propietarios de una propiedad: más que esto no entra en la ficha. */
const MAX_OWNERS = 20;
const MAX_FEATURES = 200;
const MAX_TAGS = 200;

const KindSchema = z.enum(CUSTOM_ATTRIBUTE_KINDS);
const OptionsSchema = z.array(z.string()).catch([]);

/** Nombres de los catálogos, propietarios, portada y cantidades de la ficha. */
export class DrizzlePropertyDetailLookups implements PropertyDetailLookups {
  constructor(private readonly db: DbExecutor) {}

  async locationPath(locationId: string): Promise<readonly PropertyLocationLevel[]> {
    const [row] = await this.db
      .select({ path: locations.path })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (!row) return [];
    const ids = row.path.split('/').filter((part) => part !== '');
    const rows = await this.db
      .select({ id: locations.id, name: locations.name, kind: locations.kind })
      .from(locations)
      .where(inArray(locations.id, ids))
      .limit(LOCATION_KINDS.length);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }

  async features(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: features.id, kind: features.kind, name: features.name })
      .from(features)
      .where(inArray(features.id, [...ids]))
      .orderBy(asc(features.kind), asc(features.position), asc(features.id))
      .limit(MAX_FEATURES);
  }

  async tags(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: propertyTags.id, name: propertyTags.name, groupName: propertyTagGroups.name })
      .from(propertyTags)
      .leftJoin(propertyTagGroups, eq(propertyTagGroups.id, propertyTags.groupId))
      .where(inArray(propertyTags.id, [...ids]))
      .orderBy(asc(propertyTags.name), asc(propertyTags.id))
      .limit(MAX_TAGS);
    return rows.map((row) => ({ ...row, groupName: row.groupName ?? undefined }));
  }

  async customAttributes(
    withValues: readonly string[],
  ): Promise<readonly Omit<PanelPropertyCustomAttribute, 'value'>[]> {
    const rows = await this.db
      .select()
      .from(propertyCustomAttributes)
      .where(
        withValues.length === 0
          ? eq(propertyCustomAttributes.isActive, true)
          : or(
              eq(propertyCustomAttributes.isActive, true),
              inArray(propertyCustomAttributes.id, [...withValues]),
            ),
      )
      .orderBy(asc(propertyCustomAttributes.position), asc(propertyCustomAttributes.id))
      .limit(MAX_CUSTOM_ATTRIBUTES);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: KindSchema.parse(row.kind),
      options: OptionsSchema.parse(row.options),
      isActive: row.isActive,
    }));
  }

  /** El nombre del cliente (o su teléfono, si no tiene) para mostrarlo en la ficha. */
  async owners(propertyId: string) {
    const rows = await this.db
      .select({ id: clients.id, name: clients.name, companyName: clients.companyName })
      .from(propertyOwners)
      .innerJoin(clients, eq(clients.id, propertyOwners.clientId))
      .where(and(eq(propertyOwners.propertyId, propertyId), isNull(clients.deletedAt)))
      .orderBy(asc(clients.name), asc(clients.id))
      .limit(MAX_OWNERS);
    return rows.map((row) => ({ id: row.id, name: row.name ?? row.companyName ?? 'Sin nombre' }));
  }

  async cover(propertyId: string) {
    const [row] = await this.db
      .select({
        mediaId: mediaItems.id,
        hasThumbnail: sql<boolean>`${mediaItems.variants} ? 'thumbnail'`,
      })
      .from(mediaItems)
      .where(and(eq(mediaItems.propertyId, propertyId), eq(mediaItems.isCover, true)))
      .limit(1);
    return row;
  }

  async counts(propertyId: string) {
    const [media, files] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(mediaItems)
        .where(eq(mediaItems.propertyId, propertyId)),
      this.db
        .select({ total: count() })
        .from(attachments)
        .where(and(eq(attachments.propertyId, propertyId), isNull(attachments.deletedAt))),
    ]);
    return { media: media[0]?.total ?? 0, attachments: files[0]?.total ?? 0 };
  }

  async createdBy(propertyId: string) {
    const [row] = await this.db
      .select({ createdBy: properties.createdBy })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    return row?.createdBy ?? undefined;
  }

  async development(developmentId: string) {
    const [row] = await this.db
      .select({ id: developments.id, code: developments.code, name: developments.name })
      .from(developments)
      .where(eq(developments.id, developmentId))
      .limit(1);
    return row;
  }

  /** El nombre del cliente (o su empresa); uno suprimido o borrado no se muestra. */
  async clientName(clientId: string) {
    const [row] = await this.db
      .select({ name: clients.name, companyName: clients.companyName })
      .from(clients)
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .limit(1);
    return row === undefined ? undefined : (row.name ?? row.companyName ?? 'Sin nombre');
  }
}
