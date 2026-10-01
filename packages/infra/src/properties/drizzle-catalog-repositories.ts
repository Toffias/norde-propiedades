import {
  Coordinates,
  DEFAULT_GRID_COLUMNS,
  FEATURE_KINDS,
  FavoriteSearch,
  Feature,
  GRID_COLUMN_OPTIONS,
  LOCATION_KINDS,
  Location,
  PROPERTY_ATTRIBUTE_KEYS,
  PROPERTY_KINDS,
  PropertyTag,
  TagGroup,
  defaultTypeSetting,
  type FavoriteSearchId,
  type FavoriteSearchRepository,
  type FeatureId,
  type FeatureKind,
  type FeatureRepository,
  type GridColumn,
  type LocationId,
  type LocationRepository,
  type PropertyKind,
  type PropertySettingsRepository,
  type PropertyTypeSetting,
  type PropertyTypeSettingsRepository,
  type TagGroupId,
  type TagGroupRepository,
  type TagId,
  type TagRepository,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { and, asc, count, eq, inArray, isNull, max, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  developmentTagAssignments,
  favoritePropertySearches,
  features,
  locations,
  propertySettings,
  propertyTagAssignments,
  propertyTagGroups,
  propertyTags,
  propertyTypeSettings,
} from '../db/schema';

// Repositorios de los catálogos y la configuración de propiedades. Solo mapean filas y aggregates.

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the property catalogs');
  return result.value;
}

/** Mismo nombre, con la normalización de la base (minúsculas, sin acentos). */
function sameName(column: SQL | typeof locations.normalizedName, name: string): SQL {
  return sql`${column} = core.search_normalize(${name.trim()})`;
}

const LocationKind = z.enum(LOCATION_KINDS);
const FeatureKindSchema = z.enum(FEATURE_KINDS);
const TypeSettingRow = z.object({
  propertyType: z.enum(PROPERTY_KINDS),
  isEnabled: z.boolean(),
  // Un atributo que ya no existe en el catálogo se descarta al leer.
  visibleAttributes: z.array(z.string()),
});
const GridColumns = z.array(z.string());
const Params = z.record(z.string(), z.string());

export class DrizzleLocationRepository implements LocationRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: LocationId) {
    return this.findOneWhere(eq(locations.id, id));
  }

  findSibling(parentId: LocationId | undefined, name: string) {
    return this.findOneWhere(
      and(
        parentId === undefined ? isNull(locations.parentId) : eq(locations.parentId, parentId),
        sameName(locations.normalizedName, name),
      ),
    );
  }

  async findLineage(id: LocationId): Promise<readonly Location[]> {
    const [row] = await this.db
      .select({ path: locations.path })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    if (!row) return [];
    const ids = row.path.split('/').filter((part) => part !== '');
    const rows = await this.db
      .select()
      .from(locations)
      .where(inArray(locations.id, ids))
      .limit(LOCATION_KINDS.length);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((ancestor) => {
      const found = byId.get(ancestor);
      return found ? [toLocation(found)] : [];
    });
  }

  async save(location: Location, actorId: string): Promise<void> {
    const s = location.toSnapshot();
    const values = {
      name: s.name,
      normalizedName: sql`core.search_normalize(${s.name})`,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(locations)
      .values({
        id: s.id,
        parentId: s.parentId ?? null,
        kind: s.kind,
        path: s.path,
        latitude: s.coordinates?.latitude ?? null,
        longitude: s.coordinates?.longitude ?? null,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: locations.id, set: values });
  }

  private async findOneWhere(where: SQL | undefined): Promise<Location | undefined> {
    const [row] = await this.db.select().from(locations).where(where).limit(1);
    return row ? toLocation(row) : undefined;
  }
}

function toLocation(row: typeof locations.$inferSelect): Location {
  return Location.restore({
    id: stored(parseId<'Location'>(row.id)),
    parentId: row.parentId === null ? undefined : stored(parseId<'Location'>(row.parentId)),
    kind: LocationKind.parse(row.kind),
    name: row.name,
    path: row.path,
    coordinates:
      row.latitude === null || row.longitude === null
        ? undefined
        : stored(Coordinates.create(row.latitude, row.longitude)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleFeatureRepository implements FeatureRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: FeatureId) {
    return this.findOneWhere(eq(features.id, id));
  }

  findByKey(key: string) {
    return this.findOneWhere(eq(features.key, key));
  }

  findByName(kind: FeatureKind, name: string) {
    return this.findOneWhere(
      and(eq(features.kind, kind), sameName(sql`core.search_normalize(${features.name})`, name)),
    );
  }

  async nextPosition(kind: FeatureKind): Promise<number> {
    const [row] = await this.db
      .select({ last: max(features.position) })
      .from(features)
      .where(eq(features.kind, kind));
    return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
  }

  async save(feature: Feature, actorId: string): Promise<void> {
    const s = feature.toSnapshot();
    const values = {
      name: s.name,
      position: s.position,
      isActive: s.isActive,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(features)
      .values({
        id: s.id,
        kind: s.kind,
        key: s.key,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: features.id, set: values });
  }

  private async findOneWhere(where: SQL | undefined): Promise<Feature | undefined> {
    const [row] = await this.db.select().from(features).where(where).limit(1);
    if (!row) return undefined;
    return Feature.restore({
      id: stored(parseId<'Feature'>(row.id)),
      kind: FeatureKindSchema.parse(row.kind),
      key: row.key,
      name: row.name,
      position: row.position,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export class DrizzleTagGroupRepository implements TagGroupRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: TagGroupId) {
    return this.findOneWhere(eq(propertyTagGroups.id, id));
  }

  findByName(name: string) {
    return this.findOneWhere(sameName(sql`core.search_normalize(${propertyTagGroups.name})`, name));
  }

  async nextPosition(): Promise<number> {
    const [row] = await this.db
      .select({ last: max(propertyTagGroups.position) })
      .from(propertyTagGroups);
    return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
  }

  async countTags(id: TagGroupId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(propertyTags)
      .where(eq(propertyTags.groupId, id));
    return row?.total ?? 0;
  }

  async save(group: TagGroup, actorId: string): Promise<void> {
    const s = group.toSnapshot();
    const values = {
      name: s.name,
      position: s.position,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(propertyTagGroups)
      .values({ id: s.id, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: propertyTagGroups.id, set: values });
  }

  async delete(id: TagGroupId): Promise<void> {
    await this.db.delete(propertyTagGroups).where(eq(propertyTagGroups.id, id));
  }

  private async findOneWhere(where: SQL | undefined): Promise<TagGroup | undefined> {
    const [row] = await this.db.select().from(propertyTagGroups).where(where).limit(1);
    if (!row) return undefined;
    return TagGroup.restore({
      id: stored(parseId<'PropertyTagGroup'>(row.id)),
      name: row.name,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: TagId) {
    return this.findOneWhere(eq(propertyTags.id, id));
  }

  findInGroup(groupId: TagGroupId | undefined, name: string) {
    return this.findOneWhere(
      and(
        groupId === undefined ? isNull(propertyTags.groupId) : eq(propertyTags.groupId, groupId),
        // Misma expresión que `property_tags_group_name_uq`.
        sql`lower(${propertyTags.name}) = lower(${name.trim()})`,
      ),
    );
  }

  async findExistingIds(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: propertyTags.id })
      .from(propertyTags)
      .where(inArray(propertyTags.id, [...ids]));
    return rows.map((row) => row.id);
  }

  async countUses(id: TagId): Promise<number> {
    const [properties, developments] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(propertyTagAssignments)
        .where(eq(propertyTagAssignments.tagId, id)),
      this.db
        .select({ total: count() })
        .from(developmentTagAssignments)
        .where(eq(developmentTagAssignments.tagId, id)),
    ]);
    return (properties[0]?.total ?? 0) + (developments[0]?.total ?? 0);
  }

  async save(tag: PropertyTag, actorId: string): Promise<void> {
    const s = tag.toSnapshot();
    const values = {
      name: s.name,
      groupId: s.groupId ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(propertyTags)
      .values({ id: s.id, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: propertyTags.id, set: values });
  }

  async delete(id: TagId): Promise<void> {
    await this.db.delete(propertyTags).where(eq(propertyTags.id, id));
  }

  private async findOneWhere(where: SQL | undefined): Promise<PropertyTag | undefined> {
    const [row] = await this.db.select().from(propertyTags).where(where).limit(1);
    if (!row) return undefined;
    return PropertyTag.restore({
      id: stored(parseId<'PropertyTag'>(row.id)),
      groupId: row.groupId === null ? undefined : stored(parseId<'PropertyTagGroup'>(row.groupId)),
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

/** Lectura de la configuración de tipos: la comparten el repositorio y la query de catálogos. */
export async function readTypeSettings(db: DbExecutor): Promise<readonly PropertyTypeSetting[]> {
  const rows = await db
    .select({
      propertyType: propertyTypeSettings.propertyType,
      isEnabled: propertyTypeSettings.isEnabled,
      visibleAttributes: propertyTypeSettings.visibleAttributes,
    })
    .from(propertyTypeSettings)
    .orderBy(asc(propertyTypeSettings.propertyType))
    .limit(PROPERTY_KINDS.length);
  const byKind = new Map(
    rows.flatMap((row) => {
      const parsed = TypeSettingRow.safeParse(row);
      return parsed.success ? [[parsed.data.propertyType, parsed.data] as const] : [];
    }),
  );
  return PROPERTY_KINDS.map((kind): PropertyTypeSetting => {
    const row = byKind.get(kind);
    if (!row) return defaultTypeSetting(kind);
    return {
      kind,
      isEnabled: row.isEnabled,
      visibleAttributes: PROPERTY_ATTRIBUTE_KEYS.filter((key) =>
        row.visibleAttributes.includes(key),
      ),
    };
  });
}

export class DrizzlePropertyTypeSettingsRepository implements PropertyTypeSettingsRepository {
  constructor(private readonly db: DbExecutor) {}

  all() {
    return readTypeSettings(this.db);
  }

  async find(kind: PropertyKind): Promise<PropertyTypeSetting> {
    const all = await readTypeSettings(this.db);
    return all.find((setting) => setting.kind === kind) ?? defaultTypeSetting(kind);
  }

  async save(setting: PropertyTypeSetting, actorId: string, now: Date): Promise<void> {
    const values = {
      isEnabled: setting.isEnabled,
      visibleAttributes: [...setting.visibleAttributes],
      position: PROPERTY_KINDS.indexOf(setting.kind),
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.db
      .insert(propertyTypeSettings)
      .values({ propertyType: setting.kind, createdAt: now, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: propertyTypeSettings.propertyType, set: values });
  }
}

/** Columnas de la grilla: las que existen en el catálogo, en el orden guardado. */
export async function readGridColumns(db: DbExecutor): Promise<readonly GridColumn[]> {
  const [row] = await db
    .select({ gridColumns: propertySettings.gridColumns })
    .from(propertySettings)
    .limit(1);
  if (!row) return DEFAULT_GRID_COLUMNS;
  const saved = GridColumns.parse(row.gridColumns);
  return saved.flatMap((name) => GRID_COLUMN_OPTIONS.filter((option) => option === name));
}

export class DrizzlePropertySettingsRepository implements PropertySettingsRepository {
  constructor(private readonly db: DbExecutor) {}

  gridColumns() {
    return readGridColumns(this.db);
  }

  async saveGridColumns(columns: readonly GridColumn[], actorId: string, now: Date): Promise<void> {
    // La fila única la crea la migración.
    await this.db
      .update(propertySettings)
      .set({ gridColumns: [...columns], updatedAt: now, updatedBy: actorId });
  }
}

export class DrizzleFavoriteSearchRepository implements FavoriteSearchRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: FavoriteSearchId) {
    return this.findOneWhere(eq(favoritePropertySearches.id, id));
  }

  findByName(userId: string, name: string) {
    return this.findOneWhere(
      and(
        eq(favoritePropertySearches.userId, userId),
        sameName(sql`core.search_normalize(${favoritePropertySearches.name})`, name),
      ),
    );
  }

  async countByUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(favoritePropertySearches)
      .where(eq(favoritePropertySearches.userId, userId));
    return row?.total ?? 0;
  }

  async save(search: FavoriteSearch, actorId: string): Promise<void> {
    const s = search.toSnapshot();
    const values = { name: s.name, params: s.params, updatedAt: s.updatedAt, updatedBy: actorId };
    await this.db
      .insert(favoritePropertySearches)
      .values({ id: s.id, userId: s.userId, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: favoritePropertySearches.id, set: values });
  }

  async delete(id: FavoriteSearchId): Promise<void> {
    await this.db.delete(favoritePropertySearches).where(eq(favoritePropertySearches.id, id));
  }

  private async findOneWhere(where: SQL | undefined): Promise<FavoriteSearch | undefined> {
    const [row] = await this.db.select().from(favoritePropertySearches).where(where).limit(1);
    if (!row) return undefined;
    return FavoriteSearch.restore({
      id: stored(parseId<'FavoriteSearch'>(row.id)),
      userId: row.userId,
      name: row.name,
      params: Params.parse(row.params),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
