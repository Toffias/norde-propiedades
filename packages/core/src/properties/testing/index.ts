// Fakes del módulo properties para tests (`@norde/core/properties/testing`).

import { Actor, err, ok, parseId, type PageSlice, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  PanelPropertyListCriteria,
  PanelPropertyListItem,
  PanelPropertyListQuery,
} from '../application/ports/panel-property-list-query';
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
import type { UserNames } from '../application/ports/user-names';
import { Property, type PropertyId, type PropertySnapshot } from '../domain/property';
import type { PropertyRepository } from '../domain/property.repository';

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
    operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    producerUserId: PRODUCER_ID,
    branchId: BRANCH_ID,
    deletedAt: undefined,
    deletedBy: undefined,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    ...rest,
  };
}

export class InMemoryPropertyRepository implements PropertyRepository {
  readonly rows = new Map<string, PropertySnapshot>();
  /** Quién guardó cada propiedad por última vez. */
  readonly savedBy = new Map<string, string>();

  findById(id: PropertyId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Property.restore(row) : undefined);
  }

  save(property: Property, actorId: string) {
    this.rows.set(property.id, property.toSnapshot());
    this.savedBy.set(property.id, actorId);
    return Promise.resolve();
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

export class InMemoryPropertiesUnitOfWork implements PropertiesUnitOfWork {
  readonly properties = new InMemoryPropertyRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: PropertiesTransaction) => Promise<T>): Promise<T> {
    const backup = {
      rows: new Map(this.properties.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.properties.rows.clear();
      for (const [key, value] of backup.rows) this.properties.rows.set(key, value);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
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

/** Devuelve las filas dadas y registra con qué criterio se la llamó. */
export class StubPanelPropertyListQuery implements PanelPropertyListQuery {
  readonly calls: PanelPropertyListCriteria[] = [];

  constructor(private readonly slice: PageSlice<PanelPropertyListItem> = { items: [], total: 0 }) {}

  search(criteria: PanelPropertyListCriteria) {
    this.calls.push(criteria);
    return Promise.resolve(this.slice);
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
