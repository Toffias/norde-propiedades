// Fakes del módulo properties para tests (`@norde/core/properties/testing`).

import { Actor, err, ok, parseId, type PageSlice, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  DevelopmentRef,
  PanelPropertyCustomAttribute,
  PanelPropertyRow,
  PropertyExportFormat,
} from '../contracts';
import type { DevelopmentCodeAllocator } from '../application/ports/development-code-allocator';
import type {
  DevelopmentListCriteria,
  DevelopmentListItem,
  DevelopmentListQuery,
} from '../application/ports/development-list-query';
import type { GeocodingFailedError, Geocoder } from '../application/ports/geocoder';
import type {
  BoundingBox,
  PanelPropertyFilterCriteria,
  PanelPropertyListCriteria,
  PanelPropertyListItem,
  PanelPropertyListQuery,
} from '../application/ports/panel-property-list-query';
import type { PropertyCatalogQuery } from '../application/ports/property-catalog-query';
import type { ExportFile, PropertyExportWriter } from '../application/ports/property-export-writer';
import type {
  PropertiesTransaction,
  PropertiesUnitOfWork,
} from '../application/ports/properties-transaction';
import type {
  PropertyRecord,
  PropertySearchCriteria,
  PropertySearchQuery,
} from '../application/ports/property-search-query';
import type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from '../application/ports/reference-code-allocator';
import type { Producers, UserNames } from '../application/ports/user-names';
import type {
  CustomAttributeRepository,
  FeatureRepository,
  LocationRepository,
  PropertySettingsRepository,
  PropertyTypeSettingsRepository,
  TagGroupRepository,
  TagRepository,
} from '../domain/catalog.repository';
import {
  FavoriteSearch,
  type FavoriteSearchId,
  type FavoriteSearchRepository,
  type FavoriteSearchSnapshot,
} from '../domain/favorite-search';
import {
  CustomAttribute,
  type CustomAttributeId,
  type CustomAttributeSnapshot,
} from '../domain/custom-attribute';
import {
  Development,
  EMPTY_DEVELOPMENT_DEAL,
  type DevelopmentId,
  type DevelopmentSnapshot,
} from '../domain/development';
import type { DevelopmentRepository } from '../domain/development.repository';
import { Feature, type FeatureId, type FeatureKind, type FeatureSnapshot } from '../domain/feature';
import type { GridColumn } from '../domain/grid-columns';
import { Location, type LocationId, type LocationSnapshot } from '../domain/location';
import type { PropertyKind } from '../domain/property-catalog';
import {
  PropertyTag,
  TagGroup,
  type TagGroupId,
  type TagGroupSnapshot,
  type TagId,
  type TagSnapshot,
} from '../domain/property-tag';
import { defaultTypeSetting, type PropertyTypeSetting } from '../domain/property-type-settings';
import {
  Property,
  type PriceChange,
  type PropertyId,
  type PropertySnapshot,
} from '../domain/property';
import type { PropertyRepository } from '../domain/property.repository';
import { MediaItem, type MediaItemId, type MediaItemSnapshot } from '../domain/media-item';
import type { MediaItemRepository, PropertyAttachmentRepository } from '../domain/media.repository';
import {
  PropertyAttachment,
  type PropertyAttachmentId,
  type PropertyAttachmentSnapshot,
} from '../domain/property-attachment';
import type { ImageVariantGenerator } from '../application/ports/image-variant-generator';
import type { PropertyMediaQuery } from '../application/ports/property-media-query';
import type {
  OwnerReports,
  PropertyDocumentContent,
  PropertyDocumentQuery,
  PropertyDocumentRenderer,
} from '../application/ports/property-documents';
import type { PropertyDetailLookups } from '../application/ports/property-detail-lookups';
import {
  PropertyDocument,
  type PropertyDocumentId,
  type PropertyDocumentSnapshot,
} from '../domain/property-document';
import type { PropertyDocumentRepository } from '../domain/property-document.repository';
import type { OwnerReport } from '../../reporting';
import {
  DEFAULT_PUBLICATION,
  EMPTY_CHARACTERISTICS,
  EMPTY_DEAL_ATTRIBUTES,
  EMPTY_INTERNAL_INFO,
} from '../domain/property-details';

let sequence = 0;

/** Propiedad publicada y disponible, con valores razonables; se pisan los campos que importan. */
export function aPropertyRecord(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  sequence += 1;
  const suffix = sequence.toString().padStart(12, '0');
  return {
    id: `00000000-0000-7000-8000-${suffix}`,
    code: `P-${sequence.toString().padStart(3, '0')}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    description: 'Descripción de prueba',
    operation: 'rent',
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    address: 'Gurruchaga 1800',
    showExactAddress: false,
    neighborhood: 'Palermo',
    city: 'CABA',
    priceCents: 55_000_000n,
    currency: 'ARS',
    expensesCents: null,
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    surfaceTotalM2: 48,
    surfaceCoveredM2: 44,
    amenities: [],
    imageUrls: ['https://example.com/1.jpg'],
    ...overrides,
  };
}

/** Implementación simple en memoria: suficiente para probar casos de uso, no la búsqueda SQL. */
export class InMemoryPropertySearchQuery implements PropertySearchQuery {
  readonly criteria: PropertySearchCriteria[] = [];

  constructor(readonly records: PropertyRecord[] = []) {}

  search(criteria: PropertySearchCriteria) {
    this.criteria.push(criteria);
    const matches = this.records.filter(
      (r) =>
        criteria.statuses.includes(r.status) &&
        (!criteria.publishedOnWebOnly || r.publishedOnWeb) &&
        (criteria.operation === undefined || r.operation === criteria.operation) &&
        (criteria.propertyType === undefined || r.propertyType === criteria.propertyType) &&
        (criteria.location === undefined ||
          `${r.neighborhood} ${r.city}`.toLowerCase().includes(criteria.location.toLowerCase())),
    );
    return Promise.resolve({
      items: matches.slice(criteria.offset, criteria.offset + criteria.limit),
      total: matches.length,
    });
  }

  findById(id: string) {
    return Promise.resolve(this.records.find((r) => r.id === id));
  }
}

// ---------- Panel de gestión ----------

export const TEST_NOW = new Date('2026-10-01T12:00:00Z');
export const PRODUCER_ID = '00000000-0000-7000-8000-0000000000a1';
export const OTHER_USER_ID = '00000000-0000-7000-8000-0000000000a2';
export const BRANCH_ID = '00000000-0000-7000-8000-0000000000b1';
export const PROPERTY_ID = '00000000-0000-7000-8000-0000000000c1';

/** Agente con su cartera: crea, ve y borra lo propio. */
export const TEST_PRODUCER = Actor.user(PRODUCER_ID, [
  'properties:read',
  'properties:create',
  'properties:delete',
])
  .withBranch(BRANCH_ID)
  .withCorrelation('req-1');
/** Gerente: borra y restaura propiedades de cualquiera. */
export const TEST_MANAGER = Actor.user(OTHER_USER_ID, ['properties:*']);
/** Sin permisos sobre propiedades. */
export const TEST_OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000a3', ['clients:read']);

function unwrapId(raw: string): PropertyId {
  const id = parseId<'Property'>(raw);
  if (id.isErr()) throw new Error('Invalid test fixture');
  return id.value;
}

export function propertySnapshot(
  overrides: Partial<Omit<PropertySnapshot, 'id'>> & { readonly id?: string } = {},
): PropertySnapshot {
  const { id, ...rest } = overrides;
  return {
    id: unwrapId(id ?? PROPERTY_ID),
    code: 'DEP0001',
    slug: 'departamento-en-venta-en-palermo-dep0001',
    kind: 'apartment',
    status: 'draft',
    address: {
      street: 'Gurruchaga',
      streetNumber: '1834',
      floor: '3',
      unit: 'B',
      neighborhood: 'Palermo',
      city: 'CABA',
      province: 'Buenos Aires',
    },
    publishAddress: 'Gurruchaga al 1800',
    portalTitle: 'Departamento en venta en Palermo',
    coordinates: undefined,
    locationId: undefined,
    developmentId: undefined,
    operations: [
      {
        operation: 'sale',
        currency: 'USD',
        priceCents: 12_000_000n,
        priceOnRequest: false,
        commissionPct: undefined,
      },
    ],
    tagIds: [],
    producerUserId: PRODUCER_ID,
    branchId: BRANCH_ID,
    description: '',
    characteristics: EMPTY_CHARACTERISTICS,
    deal: EMPTY_DEAL_ATTRIBUTES,
    featureIds: [],
    customAttributes: [],
    internal: EMPTY_INTERNAL_INFO,
    publication: DEFAULT_PUBLICATION,
    statusChangedAt: new Date('2026-09-01T12:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    ...rest,
  };
}

/** Nombre en minúsculas y sin acentos, como `core.search_normalize`. */
function normalized(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Un repositorio en memoria guarda snapshots: se puede copiar para deshacer una transacción. */
interface Snapshotting {
  readonly rows: Map<string, unknown>;
}

export class InMemoryPropertyRepository implements PropertyRepository {
  readonly rows = new Map<string, PropertySnapshot>();
  /** Quién guardó cada propiedad por última vez. */
  readonly savedBy = new Map<string, string>();
  /** Historial de precios guardado, por propiedad. */
  readonly priceChanges: { readonly propertyId: string; readonly change: PriceChange }[] = [];

  findById(id: PropertyId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Property.restore(row) : undefined);
  }

  findByCode(code: string) {
    const row = [...this.rows.values()].find((r) => r.code === code);
    return Promise.resolve(row ? Property.restore(row) : undefined);
  }

  save(property: Property, actorId: string) {
    this.rows.set(property.id, property.toSnapshot());
    this.savedBy.set(property.id, actorId);
    for (const change of property.priceChanges) {
      this.priceChanges.push({ propertyId: property.id, change });
    }
    return Promise.resolve();
  }
}

export class InMemoryLocationRepository implements LocationRepository {
  readonly rows = new Map<string, LocationSnapshot>();

  add(snapshot: LocationSnapshot): this {
    this.rows.set(snapshot.id, snapshot);
    return this;
  }

  findById(id: LocationId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Location.restore(row) : undefined);
  }

  findSibling(parentId: LocationId | undefined, name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.parentId === parentId && normalized(r.name) === normalized(name),
    );
    return Promise.resolve(row ? Location.restore(row) : undefined);
  }

  findLineage(id: LocationId) {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve([]);
    const ids = row.path.split('/').filter((part) => part !== '');
    return Promise.resolve(
      ids.flatMap((ancestor) => {
        const found = this.rows.get(ancestor);
        return found ? [Location.restore(found)] : [];
      }),
    );
  }

  save(location: Location) {
    this.rows.set(location.id, location.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryFeatureRepository implements FeatureRepository {
  readonly rows = new Map<string, FeatureSnapshot>();

  findById(id: FeatureId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Feature.restore(row) : undefined);
  }

  findByKey(key: string) {
    const row = [...this.rows.values()].find((r) => r.key === key);
    return Promise.resolve(row ? Feature.restore(row) : undefined);
  }

  findExistingIds(ids: readonly string[]) {
    return Promise.resolve(ids.filter((id) => this.rows.has(id)));
  }

  findByName(kind: FeatureKind, name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.kind === kind && normalized(r.name) === normalized(name),
    );
    return Promise.resolve(row ? Feature.restore(row) : undefined);
  }

  nextPosition(kind: FeatureKind) {
    const positions = [...this.rows.values()].filter((r) => r.kind === kind).map((r) => r.position);
    return Promise.resolve(positions.length === 0 ? 0 : Math.max(...positions) + 1);
  }

  save(feature: Feature) {
    this.rows.set(feature.id, feature.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryCustomAttributeRepository implements CustomAttributeRepository {
  readonly rows = new Map<string, CustomAttributeSnapshot>();

  add(snapshot: CustomAttributeSnapshot): this {
    this.rows.set(snapshot.id, snapshot);
    return this;
  }

  findById(id: CustomAttributeId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? CustomAttribute.restore(row) : undefined);
  }

  findByName(name: string) {
    const row = [...this.rows.values()].find((r) => normalized(r.name) === normalized(name));
    return Promise.resolve(row ? CustomAttribute.restore(row) : undefined);
  }

  findByIds(ids: readonly string[]) {
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [CustomAttribute.restore(row)] : [];
      }),
    );
  }

  nextPosition() {
    return Promise.resolve(Math.max(-1, ...[...this.rows.values()].map((r) => r.position)) + 1);
  }

  save(attribute: CustomAttribute) {
    this.rows.set(attribute.id, attribute.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryTagRepository implements TagRepository {
  readonly rows = new Map<string, TagSnapshot>();
  /** Cuántas propiedades usan cada etiqueta (las asignaciones viven en las propiedades). */
  readonly uses = new Map<string, number>();

  findById(id: TagId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? PropertyTag.restore(row) : undefined);
  }

  findInGroup(groupId: TagGroupId | undefined, name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.groupId === groupId && normalized(r.name) === normalized(name),
    );
    return Promise.resolve(row ? PropertyTag.restore(row) : undefined);
  }

  findExistingIds(ids: readonly string[]) {
    return Promise.resolve(ids.filter((id) => this.rows.has(id)));
  }

  countUses(id: TagId) {
    return Promise.resolve(this.uses.get(id) ?? 0);
  }

  save(tag: PropertyTag) {
    this.rows.set(tag.id, tag.toSnapshot());
    return Promise.resolve();
  }

  delete(id: TagId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryTagGroupRepository implements TagGroupRepository {
  readonly rows = new Map<string, TagGroupSnapshot>();

  constructor(private readonly tags: InMemoryTagRepository) {}

  findById(id: TagGroupId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? TagGroup.restore(row) : undefined);
  }

  findByName(name: string) {
    const row = [...this.rows.values()].find((r) => normalized(r.name) === normalized(name));
    return Promise.resolve(row ? TagGroup.restore(row) : undefined);
  }

  nextPosition() {
    const positions = [...this.rows.values()].map((r) => r.position);
    return Promise.resolve(positions.length === 0 ? 0 : Math.max(...positions) + 1);
  }

  countTags(id: TagGroupId) {
    return Promise.resolve([...this.tags.rows.values()].filter((t) => t.groupId === id).length);
  }

  save(group: TagGroup) {
    this.rows.set(group.id, group.toSnapshot());
    return Promise.resolve();
  }

  delete(id: TagGroupId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryPropertyTypeSettingsRepository implements PropertyTypeSettingsRepository {
  readonly rows = new Map<string, PropertyTypeSetting>();

  all() {
    return Promise.resolve(
      (
        ['apartment', 'house', 'ph', 'land', 'office', 'commercial', 'garage', 'warehouse'] as const
      ).map((kind) => this.rows.get(kind) ?? defaultTypeSetting(kind)),
    );
  }

  find(kind: PropertyKind) {
    return Promise.resolve(this.rows.get(kind) ?? defaultTypeSetting(kind));
  }

  save(setting: PropertyTypeSetting) {
    this.rows.set(setting.kind, setting);
    return Promise.resolve();
  }
}

export class InMemoryPropertySettingsRepository implements PropertySettingsRepository {
  readonly rows = new Map<string, readonly GridColumn[]>([['gridColumns', []]]);

  gridColumns() {
    return Promise.resolve(this.rows.get('gridColumns') ?? []);
  }

  saveGridColumns(columns: readonly GridColumn[]) {
    this.rows.set('gridColumns', columns);
    return Promise.resolve();
  }
}

export class InMemoryFavoriteSearchRepository implements FavoriteSearchRepository {
  readonly rows = new Map<string, FavoriteSearchSnapshot>();

  findById(id: FavoriteSearchId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? FavoriteSearch.restore(row) : undefined);
  }

  findByName(userId: string, name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.userId === userId && normalized(r.name) === normalized(name),
    );
    return Promise.resolve(row ? FavoriteSearch.restore(row) : undefined);
  }

  countByUser(userId: string) {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userId === userId).length);
  }

  save(search: FavoriteSearch) {
    this.rows.set(search.id, search.toSnapshot());
    return Promise.resolve();
  }

  delete(id: FavoriteSearchId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

export class InMemoryPropertiesUnitOfWork implements PropertiesUnitOfWork {
  readonly properties = new InMemoryPropertyRepository();
  readonly developments = new InMemoryDevelopmentRepository(this.properties);
  readonly locations = new InMemoryLocationRepository();
  readonly features = new InMemoryFeatureRepository();
  readonly customAttributes = new InMemoryCustomAttributeRepository();
  readonly tags = new InMemoryTagRepository();
  readonly tagGroups = new InMemoryTagGroupRepository(this.tags);
  readonly typeSettings = new InMemoryPropertyTypeSettingsRepository();
  readonly settings = new InMemoryPropertySettingsRepository();
  readonly favoriteSearches = new InMemoryFavoriteSearchRepository();
  readonly media = new InMemoryMediaItemRepository();
  readonly attachments = new InMemoryPropertyAttachmentRepository();
  readonly documents = new InMemoryPropertyDocumentRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();
  /** Cuántas transacciones corrieron (las acciones masivas van por lotes). */
  transactions = 0;

  private stores(): readonly Snapshotting[] {
    return [
      this.properties,
      this.developments,
      this.locations,
      this.features,
      this.customAttributes,
      this.tags,
      this.tagGroups,
      this.typeSettings,
      this.settings,
      this.favoriteSearches,
      this.media,
      this.attachments,
      this.documents,
    ];
  }

  async run<T>(work: (tx: PropertiesTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const backup = {
      stores: this.stores().map((store) => new Map(store.rows)),
      events: this.events.published.length,
      audit: this.audit.entries.length,
      priceChanges: this.properties.priceChanges.length,
    };
    const rollback = () => {
      this.stores().forEach((store, index) => {
        store.rows.clear();
        for (const [key, value] of backup.stores[index] ?? []) store.rows.set(key, value);
      });
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
      this.properties.priceChanges.splice(backup.priceChanges);
    };
    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

/** Entrega códigos correlativos (`DEP0001`, `DEP0002`…), o falla si se lo configura así. */
export class FakeReferenceCodeAllocator implements ReferenceCodeAllocator {
  readonly requests: Parameters<ReferenceCodeAllocator['allocate']>[0][] = [];
  #next = 1;

  constructor(private readonly available = true) {}

  allocate(
    request: Parameters<ReferenceCodeAllocator['allocate']>[0],
  ): Promise<Result<string, ReferenceCodeUnavailableError>> {
    this.requests.push(request);
    if (!this.available) return Promise.resolve(err({ type: 'ReferenceCodeUnavailable' }));
    const code = `DEP${this.#next.toString().padStart(4, '0')}`;
    this.#next += 1;
    return Promise.resolve(ok(code));
  }
}

/** Fila del buscador con valores razonables; se pisan los campos que importan. */
export function aPanelItem(overrides: Partial<PanelPropertyListItem> = {}): PanelPropertyListItem {
  return {
    id: PROPERTY_ID,
    code: 'DEP0001',
    propertyType: 'apartment',
    status: 'draft',
    portalTitle: 'Departamento en venta en Palermo',
    publishAddress: 'Gurruchaga al 1800',
    floor: undefined,
    unit: undefined,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    attributes: {
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: undefined,
      ageYears: 10,
      surfaceTotalM2: 70,
      surfaceCoveredM2: 65,
    },
    coverImageUrl: undefined,
    coordinates: undefined,
    producerUserId: PRODUCER_ID,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-20T12:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

/**
 * Devuelve las filas dadas y registra con qué criterio se la llamó. Con `ids` en el criterio,
 * devuelve solo esas: alcanza para probar selecciones, no el SQL de los filtros.
 */
export class StubPanelPropertyListQuery implements PanelPropertyListQuery {
  readonly calls: PanelPropertyListCriteria[] = [];
  readonly mapCalls: { readonly area: BoundingBox; readonly limit: number }[] = [];

  constructor(private readonly slice: PageSlice<PanelPropertyListItem> = { items: [], total: 0 }) {}

  private matching(criteria: PanelPropertyFilterCriteria): readonly PanelPropertyListItem[] {
    const { ids } = criteria;
    return ids === undefined
      ? this.slice.items
      : this.slice.items.filter((i) => ids.includes(i.id));
  }

  search(criteria: PanelPropertyListCriteria) {
    this.calls.push(criteria);
    if (criteria.ids === undefined) return Promise.resolve(this.slice);
    const items = this.matching(criteria);
    return Promise.resolve({
      items: items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: items.length,
    });
  }

  matchingIds(
    criteria: PanelPropertyFilterCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ) {
    const { afterId } = page;
    const items = [...this.matching(criteria)]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((item) => afterId === undefined || item.id > afterId)
      .slice(0, page.limit)
      .map((item) => ({ id: item.id, code: item.code }));
    return Promise.resolve(items);
  }

  count(criteria: PanelPropertyFilterCriteria) {
    return Promise.resolve(
      criteria.ids === undefined ? this.slice.total : this.matching(criteria).length,
    );
  }

  mapPins(_criteria: PanelPropertyFilterCriteria, area: BoundingBox, limit: number) {
    this.mapCalls.push({ area, limit });
    return Promise.resolve({ items: this.slice.items.slice(0, limit), total: this.slice.total });
  }
}

export class InMemoryUserNames implements UserNames {
  constructor(private readonly users: ReadonlyMap<string, string> = new Map()) {}

  names(ids: readonly string[]) {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const name = this.users.get(id);
          return name === undefined ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}

/** Usuarios activos con su sucursal. */
export class InMemoryProducers implements Producers {
  constructor(
    private readonly users: ReadonlyMap<
      string,
      { readonly branchId: string | undefined }
    > = new Map(),
  ) {}

  find(userId: string) {
    return Promise.resolve(this.users.get(userId));
  }
}

/** Devuelve siempre la misma respuesta y registra las direcciones que se le pidieron. */
export class FakeGeocoder implements Geocoder {
  readonly requests: Parameters<Geocoder['locate']>[0][] = [];

  constructor(
    private readonly answer: Result<
      { readonly latitude: number; readonly longitude: number } | undefined,
      GeocodingFailedError
    > = ok(undefined),
  ) {}

  locate(request: Parameters<Geocoder['locate']>[0]) {
    this.requests.push(request);
    return Promise.resolve(this.answer);
  }
}

/** Junta las filas que recibiría la planilla, sin armar ningún archivo. */
export class FakeExportWriter implements PropertyExportWriter {
  readonly rows: PanelPropertyRow[] = [];
  format: PropertyExportFormat | undefined;

  write(
    format: PropertyExportFormat,
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
  ): ExportFile {
    this.format = format;
    const rows = this.rows;
    async function* body(): AsyncIterable<Uint8Array> {
      for await (const batch of batches) {
        rows.push(...batch);
        yield new Uint8Array();
      }
    }
    return { filename: `propiedades.${format}`, contentType: 'text/plain', body: body() };
  }
}

/** Devuelve páginas vacías y registra los criterios: las queries de catálogo son SQL en infra. */
export class StubPropertyCatalogQuery implements PropertyCatalogQuery {
  readonly calls: { readonly method: string; readonly criteria: unknown }[] = [];
  typeSettingRows: readonly PropertyTypeSetting[] = [];
  gridColumnRows: readonly GridColumn[] = [];

  private empty<T>(method: string, criteria: unknown): Promise<PageSlice<T>> {
    this.calls.push({ method, criteria });
    return Promise.resolve({ items: [], total: 0 });
  }

  searchLocations(criteria: Parameters<PropertyCatalogQuery['searchLocations']>[0]) {
    return this.empty<never>('searchLocations', criteria);
  }

  listFeatures(criteria: Parameters<PropertyCatalogQuery['listFeatures']>[0]) {
    return this.empty<never>('listFeatures', criteria);
  }

  listCustomAttributes(criteria: Parameters<PropertyCatalogQuery['listCustomAttributes']>[0]) {
    return this.empty<never>('listCustomAttributes', criteria);
  }

  listTagGroups(criteria: Parameters<PropertyCatalogQuery['listTagGroups']>[0]) {
    return this.empty<never>('listTagGroups', criteria);
  }

  searchTags(criteria: Parameters<PropertyCatalogQuery['searchTags']>[0]) {
    return this.empty<never>('searchTags', criteria);
  }

  listFavoriteSearches(criteria: Parameters<PropertyCatalogQuery['listFavoriteSearches']>[0]) {
    return this.empty<never>('listFavoriteSearches', criteria);
  }

  typeSettings() {
    return Promise.resolve(this.typeSettingRows);
  }

  gridColumns() {
    return Promise.resolve(this.gridColumnRows);
  }
}

// ---------- Multimedia y archivos ----------

export class InMemoryMediaItemRepository implements MediaItemRepository {
  readonly rows = new Map<string, MediaItemSnapshot>();

  findById(id: MediaItemId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? MediaItem.restore(row) : undefined);
  }

  listForProperty(propertyId: PropertyId) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.propertyId === propertyId)
        .sort((a, b) => a.position - b.position)
        .map((row) => MediaItem.restore(row)),
    );
  }

  count(propertyId: PropertyId) {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.propertyId === propertyId).length,
    );
  }

  nextPosition(propertyId: PropertyId) {
    const positions = [...this.rows.values()]
      .filter((row) => row.propertyId === propertyId)
      .map((row) => row.position);
    return Promise.resolve(Math.max(-1, ...positions) + 1);
  }

  save(item: MediaItem) {
    this.rows.set(item.id, item.toSnapshot());
    return Promise.resolve();
  }

  delete(id: MediaItemId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryPropertyAttachmentRepository implements PropertyAttachmentRepository {
  readonly rows = new Map<string, PropertyAttachmentSnapshot>();

  findById(id: PropertyAttachmentId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? PropertyAttachment.restore(row) : undefined);
  }

  save(attachment: PropertyAttachment) {
    this.rows.set(attachment.id, attachment.toSnapshot());
    return Promise.resolve();
  }
}

/** Devuelve variantes de un byte con medidas fijas; con `invalid`, falla como una imagen dañada. */
export class FakeImageVariantGenerator implements ImageVariantGenerator {
  invalid = false;
  readonly requests: Parameters<ImageVariantGenerator['generate']>[0][] = [];

  generate(input: Parameters<ImageVariantGenerator['generate']>[0]) {
    this.requests.push(input);
    if (this.invalid) return Promise.resolve(err({ type: 'InvalidImage' as const }));
    return Promise.resolve(
      ok({
        thumbnail: new Uint8Array([1]),
        web: new Uint8Array([2]),
        width: 1600,
        height: 1200,
      }),
    );
  }
}

/** Lee las filas de los repositorios en memoria, como lo haría el SQL de la galería y los archivos. */
export class InMemoryPropertyMediaQuery implements PropertyMediaQuery {
  constructor(
    private readonly media: InMemoryMediaItemRepository,
    private readonly attachments: InMemoryPropertyAttachmentRepository,
  ) {}

  listMedia(criteria: Parameters<PropertyMediaQuery['listMedia']>[0]) {
    const rows = [...this.media.rows.values()]
      .filter((row) => row.propertyId === criteria.propertyId)
      .filter((row) =>
        criteria.kind === undefined
          ? true
          : criteria.kind === 'images'
            ? row.kind === 'photo' || row.kind === 'floor_plan'
            : row.kind === 'video' || row.kind === 'tour_360',
      )
      .sort((a, b) => a.position - b.position);
    return Promise.resolve({
      items: rows.slice(criteria.offset, criteria.offset + criteria.limit).map((row) => ({
        id: row.id,
        kind: row.kind,
        position: row.position,
        isCover: row.isCover,
        showOnWeb: row.showOnWeb,
        includeInPdf: row.includeInPdf,
        rotation: row.rotation,
        description: row.description,
        externalUrl: row.externalUrl,
        width: row.width,
        height: row.height,
        processing: row.processing,
        hasThumbnail: row.variants.thumbnail !== undefined,
        createdAt: row.createdAt,
      })),
      total: rows.length,
    });
  }

  listAttachments(criteria: Parameters<PropertyMediaQuery['listAttachments']>[0]) {
    const direction = criteria.sort.direction === 'asc' ? 1 : -1;
    const rows = [...this.attachments.rows.values()]
      .filter((row) => row.propertyId === criteria.propertyId && row.deletedAt === undefined)
      .sort((a, b) =>
        criteria.sort.field === 'name'
          ? a.name.localeCompare(b.name) * direction
          : (a.createdAt.getTime() - b.createdAt.getTime()) * direction,
      );
    return Promise.resolve({
      items: rows.slice(criteria.offset, criteria.offset + criteria.limit).map((row) => ({
        id: row.id,
        name: row.name,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        showOnWeb: row.showOnWeb,
        uploadedBy: row.uploadedBy,
        createdAt: row.createdAt,
      })),
      total: rows.length,
    });
  }
}

// ---------- Ficha: lectura, documentos ----------

export class InMemoryPropertyDocumentRepository implements PropertyDocumentRepository {
  readonly rows = new Map<string, PropertyDocumentSnapshot>();

  findById(id: PropertyDocumentId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? PropertyDocument.restore(row) : undefined);
  }

  save(document: PropertyDocument) {
    this.rows.set(document.id, document.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryPropertyDocumentQuery implements PropertyDocumentQuery {
  constructor(private readonly documents: InMemoryPropertyDocumentRepository) {}

  list(criteria: Parameters<PropertyDocumentQuery['list']>[0]) {
    const rows = [...this.documents.rows.values()]
      .filter((row) => row.propertyId === criteria.propertyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({
      items: rows.slice(criteria.offset, criteria.offset + criteria.limit).map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        period: row.period,
        error: row.error,
        requestedBy: row.requestedBy,
        createdAt: row.createdAt,
      })),
      total: rows.length,
    });
  }
}

/** Registra lo que se le pidió imprimir y devuelve un PDF de mentira. */
export class FakeDocumentRenderer implements PropertyDocumentRenderer {
  readonly rendered: PropertyDocumentContent[] = [];
  fail = false;

  render(content: PropertyDocumentContent) {
    if (this.fail) return Promise.reject(new Error('pdf-lib exploded'));
    this.rendered.push(content);
    return Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  }
}

export class StubOwnerReports implements OwnerReports {
  report: OwnerReport | undefined = {
    from: '2026-09-01',
    to: '2026-09-30',
    publications: [],
    emailSends: 2,
    whatsappSends: 3,
    inquiries: 4,
    interested: 1,
  };

  build() {
    return Promise.resolve(this.report);
  }
}

/** Nombres fijos para los catálogos: alcanza para armar la ficha en los tests. */
export class StubPropertyDetailLookups implements PropertyDetailLookups {
  owners_: { id: string; name: string }[] = [];
  definitions: Omit<PanelPropertyCustomAttribute, 'value'>[] = [];

  locationPath(locationId: string) {
    return Promise.resolve([{ id: locationId, name: 'Palermo', kind: 'neighborhood' }]);
  }

  features(ids: readonly string[]) {
    return Promise.resolve(ids.map((id) => ({ id, kind: 'amenity', name: `Ítem ${id}` })));
  }

  tags(ids: readonly string[]) {
    return Promise.resolve(ids.map((id) => ({ id, name: `Etiqueta ${id}`, groupName: undefined })));
  }

  customAttributes() {
    return Promise.resolve(this.definitions);
  }

  owners() {
    return Promise.resolve(this.owners_);
  }

  cover() {
    return Promise.resolve(undefined);
  }

  counts() {
    return Promise.resolve({ media: 0, attachments: 0 });
  }

  createdBy() {
    return Promise.resolve(PRODUCER_ID);
  }

  /** Emprendimientos conocidos, por ID. */
  developments_ = new Map<string, DevelopmentRef>();
  /** Clientes conocidos, por ID. */
  clients_ = new Map<string, string>();

  development(developmentId: string) {
    return Promise.resolve(this.developments_.get(developmentId));
  }

  clientName(clientId: string) {
    return Promise.resolve(this.clients_.get(clientId));
  }
}

// ---------- Emprendimientos (#7) ----------

export const DEVELOPMENT_ID = '00000000-0000-7000-8000-0000000000e1';

/** Agente con su cartera de emprendimientos: los ve, crea, edita los propios y suma unidades. */
export const TEST_DEVELOPER = Actor.user(PRODUCER_ID, [
  'developments:read',
  'developments:create',
  'developments:update',
  'properties:read',
  'properties:create',
  'audit:read',
])
  .withBranch(BRANCH_ID)
  .withCorrelation('req-2');
/** Gerente: edita y borra los emprendimientos de todos. */
export const TEST_DEVELOPMENTS_MANAGER = Actor.user(OTHER_USER_ID, [
  'developments:*',
  'properties:*',
  'audit:*',
]);

function unwrapDevelopmentId(raw: string): DevelopmentId {
  const id = parseId<'Development'>(raw);
  if (id.isErr()) throw new Error('Invalid test fixture');
  return id.value;
}

export function developmentSnapshot(
  overrides: Partial<Omit<DevelopmentSnapshot, 'id'>> & { readonly id?: string } = {},
): DevelopmentSnapshot {
  const { id, ...rest } = overrides;
  return {
    id: unwrapDevelopmentId(id ?? DEVELOPMENT_ID),
    code: 'EMP0001',
    slug: 'torre-gurruchaga-emp0001',
    name: 'Torre Gurruchaga',
    kind: 'building',
    status: 'loading',
    constructionStatus: undefined,
    deliveryDate: undefined,
    privateAddress: 'Gurruchaga 1834',
    publishAddress: 'Gurruchaga al 1800',
    portalTitle: 'Torre Gurruchaga',
    locationId: undefined,
    coordinates: undefined,
    developerName: undefined,
    commercialContactClientId: undefined,
    websiteUrl: undefined,
    description: '',
    financingDetails: undefined,
    deal: EMPTY_DEVELOPMENT_DEAL,
    featureIds: [],
    tagIds: [],
    producerUserId: PRODUCER_ID,
    branchId: BRANCH_ID,
    deletedAt: undefined,
    deletedBy: undefined,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    ...rest,
  };
}

export class InMemoryDevelopmentRepository implements DevelopmentRepository {
  readonly rows = new Map<string, DevelopmentSnapshot>();
  readonly savedBy = new Map<string, string>();

  constructor(private readonly properties: InMemoryPropertyRepository) {}

  findById(id: DevelopmentId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Development.restore(row) : undefined);
  }

  countActiveUnits(id: DevelopmentId) {
    const units = [...this.properties.rows.values()].filter(
      (property) => property.developmentId === id && property.deletedAt === undefined,
    );
    return Promise.resolve(units.length);
  }

  save(development: Development, actorId: string) {
    this.rows.set(development.id, development.toSnapshot());
    this.savedBy.set(development.id, actorId);
    return Promise.resolve();
  }
}

/** Entrega códigos correlativos de emprendimiento (`EMP0001`…), o falla si se lo configura así. */
export class FakeDevelopmentCodeAllocator implements DevelopmentCodeAllocator {
  readonly requests: Parameters<DevelopmentCodeAllocator['allocate']>[0][] = [];
  #next = 1;

  constructor(private readonly available = true) {}

  allocate(
    request: Parameters<DevelopmentCodeAllocator['allocate']>[0],
  ): Promise<Result<string, ReferenceCodeUnavailableError>> {
    this.requests.push(request);
    if (!this.available) return Promise.resolve(err({ type: 'ReferenceCodeUnavailable' }));
    const code = `EMP${this.#next.toString().padStart(4, '0')}`;
    this.#next += 1;
    return Promise.resolve(ok(code));
  }
}

/** Fila del listado con valores razonables; se pisan los campos que importan. */
export function aDevelopmentItem(
  overrides: Partial<DevelopmentListItem> = {},
): DevelopmentListItem {
  return {
    id: DEVELOPMENT_ID,
    code: 'EMP0001',
    name: 'Torre Gurruchaga',
    developmentType: 'building',
    status: 'marketing',
    constructionStatus: 'under_construction',
    publishAddress: 'Gurruchaga al 1800',
    deliveryDate: '2027-12-01',
    websiteUrl: undefined,
    tags: [],
    unitCount: 0,
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

export class StubDevelopmentListQuery implements DevelopmentListQuery {
  readonly calls: DevelopmentListCriteria[] = [];

  constructor(private readonly slice: PageSlice<DevelopmentListItem> = { items: [], total: 0 }) {}

  search(criteria: DevelopmentListCriteria) {
    this.calls.push(criteria);
    return Promise.resolve(this.slice);
  }
}
