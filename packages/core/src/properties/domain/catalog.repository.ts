import type { Feature, FeatureId, FeatureKind } from './feature';
import type { Location, LocationId } from './location';
import type { GridColumn } from './grid-columns';
import type { PropertyKind } from './property-catalog';
import type { PropertyTag, TagGroup, TagGroupId, TagId } from './property-tag';
import type { PropertyTypeSetting } from './property-type-settings';

// Repositorios de los catálogos y la configuración del módulo de propiedades.

export interface LocationRepository {
  findById(id: LocationId): Promise<Location | undefined>;
  /** Otra ubicación con el mismo nombre bajo el mismo padre (sin acentos ni mayúsculas). */
  findSibling(parentId: LocationId | undefined, name: string): Promise<Location | undefined>;
  /** La ubicación y sus ancestros, de la raíz hacia abajo. */
  findLineage(id: LocationId): Promise<readonly Location[]>;
  save(location: Location, actorId: string): Promise<void>;
}

export interface FeatureRepository {
  findById(id: FeatureId): Promise<Feature | undefined>;
  findByKey(key: string): Promise<Feature | undefined>;
  /** Otro ítem del mismo tipo con ese nombre (sin acentos ni mayúsculas). */
  findByName(kind: FeatureKind, name: string): Promise<Feature | undefined>;
  /** La posición que sigue a la última de ese tipo. */
  nextPosition(kind: FeatureKind): Promise<number>;
  save(feature: Feature, actorId: string): Promise<void>;
}

export interface TagGroupRepository {
  findById(id: TagGroupId): Promise<TagGroup | undefined>;
  findByName(name: string): Promise<TagGroup | undefined>;
  nextPosition(): Promise<number>;
  /** Cuántas etiquetas tiene el grupo: un grupo con etiquetas no se borra. */
  countTags(id: TagGroupId): Promise<number>;
  save(group: TagGroup, actorId: string): Promise<void>;
  delete(id: TagGroupId): Promise<void>;
}

export interface TagRepository {
  findById(id: TagId): Promise<PropertyTag | undefined>;
  /** Otra etiqueta con el mismo nombre en el mismo grupo (sin distinguir mayúsculas). */
  findInGroup(groupId: TagGroupId | undefined, name: string): Promise<PropertyTag | undefined>;
  /** Cuáles de estos IDs existen. */
  findExistingIds(ids: readonly string[]): Promise<readonly string[]>;
  /** Cuántas propiedades y emprendimientos la tienen: una etiqueta en uso no se borra. */
  countUses(id: TagId): Promise<number>;
  save(tag: PropertyTag, actorId: string): Promise<void>;
  delete(id: TagId): Promise<void>;
}

export interface PropertyTypeSettingsRepository {
  /** Los ocho tipos; un tipo sin configuración guardada viene con la recomendada. */
  all(): Promise<readonly PropertyTypeSetting[]>;
  find(kind: PropertyKind): Promise<PropertyTypeSetting>;
  save(setting: PropertyTypeSetting, actorId: string, now: Date): Promise<void>;
}

export interface PropertySettingsRepository {
  gridColumns(): Promise<readonly GridColumn[]>;
  saveGridColumns(columns: readonly GridColumn[], actorId: string, now: Date): Promise<void>;
}
