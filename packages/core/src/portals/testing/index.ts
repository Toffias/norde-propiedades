// Fakes del módulo portals para tests (`@norde/core/portals/testing`).

import { err, ok, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  PortalAuthorizationError,
  PortalAuthorizationGrant,
  PortalAuthorizationRequest,
  PortalAuthorizer,
  PortalCredentials,
  PortalNotConfiguredError,
} from '../application/ports/portal-authorizer';
import type { PortalAdLookup } from '../application/ports/portal-ad-lookup';
import type {
  PortalAccountDirectory,
  PortalAccountLookupError,
  PortalAccountMatch,
  PortalCredit,
} from '../application/ports/portal-account-directory';
import type {
  PortalLeadNotifications,
  PortalLeadRejected,
  PortalLeadSink,
  PortalLeadSource,
} from '../application/ports/portal-leads';
import type { PortalAdReference } from '../domain/portal-ad-reference';
import type { PortalLead } from '../domain/portal-lead';
import type {
  DevelopmentByCode,
  DevelopmentCodeLookup,
  PortalListingCatalog,
  PropertyByCode,
  PropertyCodeLookup,
  RemoteDevelopment,
  RemoteListing,
} from '../application/ports/portal-listing-catalog';
import type {
  DevelopmentListingSource,
  DevelopmentListingSourceReader,
} from '../application/ports/development-listing-source';
import type {
  PortalCredentialStore,
  PortalsTransaction,
  PortalsUnitOfWork,
} from '../application/ports/portals-transaction';
import type { ListingSource, ListingSourceReader } from '../application/ports/listing-source';
import type {
  PortalConnector,
  PortalListingContent,
  PortalListingState,
  PortalListingUpdate,
  PortalSyncError,
} from '../application/ports/portal-connector';
import {
  LINKED_LISTING_STATUSES,
  type LinkedListingStatus,
  type PortalListingCount,
  type PortalListingCounter,
} from '../application/ports/portal-listing-counts';
import type { PortalListingStateReader } from '../application/ports/portal-listing-states';
import type {
  PortalListingStats,
  PortalListingStatsReader,
} from '../application/ports/portal-listing-stats';
import type { PortalPackage, PortalPackageReader } from '../application/ports/portal-packages';
import {
  Listing,
  type RemoteListingState,
  type ListingId,
  type ListingOperation,
  type ListingOwner,
  type ListingSnapshot,
} from '../domain/listing';
import {
  PORTALS,
  type ListingOwnerKind,
  type PortalId,
  type PortalLeadChannel,
} from '../domain/portal';
import { PortalAccount, type PortalAccountSnapshot } from '../domain/portal-account';
import type { ListingRepository, PortalAccountRepository } from '../domain/portals.repository';

export class InMemoryPortalAccountRepository implements PortalAccountRepository {
  readonly rows = new Map<PortalId, PortalAccountSnapshot>();

  get(portal: PortalId) {
    const row = this.rows.get(portal);
    return Promise.resolve(row ? PortalAccount.restore(row) : PortalAccount.notConnected(portal));
  }

  async all() {
    return Promise.all(PORTALS.map((portal) => this.get(portal)));
  }

  save(account: PortalAccount) {
    this.rows.set(account.portal, account.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryPortalCredentialStore implements PortalCredentialStore {
  readonly stored = new Map<PortalId, PortalCredentials>();

  save(portal: PortalId, credentials: PortalCredentials) {
    this.stored.set(portal, credentials);
    return Promise.resolve();
  }

  delete(portal: PortalId) {
    this.stored.delete(portal);
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryPortalsUnitOfWork implements PortalsUnitOfWork {
  readonly accounts = new InMemoryPortalAccountRepository();
  readonly credentials = new InMemoryPortalCredentialStore();
  readonly listings = new InMemoryListingRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: PortalsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      accounts: new Map(this.accounts.rows),
      credentials: new Map(this.credentials.stored),
      listings: new Map(this.listings.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.accounts.rows.clear();
      for (const [k, v] of backup.accounts) this.accounts.rows.set(k, v);
      this.credentials.stored.clear();
      for (const [k, v] of backup.credentials) this.credentials.stored.set(k, v);
      this.listings.rows.clear();
      for (const [k, v] of backup.listings) this.listings.rows.set(k, v);
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

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

/**
 * Autorizador de prueba: arma una URL falsa y canjea cualquier código por `grant`. Con
 * `notConfigured` o `failWith`, falla como el portal real.
 */
export class FakePortalAuthorizer implements PortalAuthorizer {
  notConfigured = false;
  failWith: PortalAuthorizationError | undefined;
  grant: PortalAuthorizationGrant = {
    credentials: {
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      expiresAt: new Date('2026-10-05T18:00:00Z'),
    },
    externalAccountId: '123456789',
    accountName: 'NORDEPROPIEDADES',
  };
  readonly completed: { portal: PortalId; code: string; codeVerifier: string }[] = [];

  begin(portal: PortalId): Result<PortalAuthorizationRequest, PortalNotConfiguredError> {
    if (this.notConfigured) return err({ type: 'PortalNotConfigured' });
    return ok({
      url: `https://portal.test/authorize?portal=${portal}&state=state-1`,
      state: 'state-1',
      codeVerifier: 'v'.repeat(43),
    });
  }

  complete(input: {
    readonly portal: PortalId;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<PortalAuthorizationGrant, PortalAuthorizationError>> {
    this.completed.push({ ...input });
    if (this.notConfigured) return Promise.resolve(err({ type: 'PortalNotConfigured' }));
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(ok(this.grant));
  }
}

/**
 * Directorio de prueba: encuentra solo la cuenta `accounts` por su código y devuelve `availableCredits`.
 * Con `failWith` o `creditsFailWith`, falla como el portal real.
 */
export class FakePortalAccountDirectory implements PortalAccountDirectory {
  readonly accounts = new Map<string, PortalAccountMatch>([
    ['17310373', { externalAccountId: '17310373', accountName: 'Norde Propiedades' }],
  ]);
  availableCredits: readonly PortalCredit[] = [
    { plan: 'SIMPLE', available: 40, contracted: 50, publishes: 'property' },
    { plan: 'HOME', available: 0, contracted: 5, publishes: 'property' },
    { plan: 'DESARROLLOS_HOME', available: 2, contracted: 2, publishes: 'development' },
  ];
  failWith: PortalAccountLookupError | undefined;
  creditsFailWith: { readonly type: 'PortalNotConfigured' | 'PortalUnavailable' } | undefined;
  readonly lookups: { portal: PortalId; accountCode: string }[] = [];
  readonly creditReads: { portal: PortalId; externalAccountId: string }[] = [];

  find(input: { readonly portal: PortalId; readonly accountCode: string }) {
    this.lookups.push({ ...input });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    const match = this.accounts.get(input.accountCode);
    return Promise.resolve(match ? ok(match) : err({ type: 'PortalAccountNotFound' as const }));
  }

  credits(input: { readonly portal: PortalId; readonly externalAccountId: string }) {
    this.creditReads.push({ ...input });
    if (this.creditsFailWith) return Promise.resolve(err(this.creditsFailWith));
    return Promise.resolve(ok(this.availableCredits));
  }
}

export class InMemoryListingRepository implements ListingRepository {
  readonly rows = new Map<string, ListingSnapshot>();
  /**
   * Simula otra transacción que tiene la fila bloqueada (un `SyncListing` en curso): `lockById`
   * la espera, una sola vez, antes de leer. `findById` no espera.
   */
  holdingLock: (() => Promise<unknown>) | undefined;

  findById(id: ListingId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Listing.restore(row));
  }

  async lockById(id: ListingId) {
    const holder = this.holdingLock;
    this.holdingLock = undefined;
    if (holder) await holder();
    return this.findById(id);
  }

  findOne(portal: PortalId, owner: ListingOwner, operation: ListingOperation | undefined) {
    const row = [...this.rows.values()].find(
      (r) =>
        r.portal === portal &&
        r.owner.kind === owner.kind &&
        r.owner.id === owner.id &&
        r.operation === operation,
    );
    return Promise.resolve(row && Listing.restore(row));
  }

  findByExternalIds(portal: PortalId, externalIds: readonly string[]) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.portal === portal && r.externalId !== undefined && externalIds.includes(r.externalId),
        )
        .map((r) => Listing.restore(r)),
    );
  }

  findForProperty(propertyId: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.owner.kind === 'property' && r.owner.id === propertyId)
        .map((r) => Listing.restore(r)),
    );
  }

  findForDevelopment(developmentId: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.owner.kind === 'development' && r.owner.id === developmentId)
        .map((r) => Listing.restore(r)),
    );
  }

  findLiveOnPortal(
    portal: PortalId,
    page: { readonly after: ListingId | undefined; readonly limit: number },
  ) {
    const { after, limit } = page;
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.portal === portal &&
            r.externalId !== undefined &&
            r.status !== 'pending' &&
            r.status !== 'unpublished' &&
            (after === undefined || r.id > after),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, limit)
        .map((r) => Listing.restore(r)),
    );
  }

  save(listing: Listing) {
    this.rows.set(listing.id, listing.toSnapshot());
    return Promise.resolve();
  }
}

/** Avisos de portales cargados a mano: `mercadolibre:MLA123` o `zonaprop:123` → propiedad. */
export class InMemoryPortalAdLookup implements PortalAdLookup {
  readonly ads = new Map<string, string>();

  propertyIdFor(reference: PortalAdReference): Promise<string | undefined> {
    const id = reference.provider === 'mercadolibre' ? reference.itemId : reference.postingId;
    return Promise.resolve(this.ads.get(`${reference.provider}:${id}`));
  }
}

/** Cuenta las publicaciones vinculadas de un `InMemoryListingRepository`, como la consulta real. */
export class InMemoryPortalListingCounter implements PortalListingCounter {
  constructor(private readonly listings: InMemoryListingRepository) {}

  countLinked(): Promise<readonly PortalListingCount[]> {
    const counts = new Map<string, PortalListingCount>();
    for (const r of this.listings.rows.values()) {
      if (r.externalId === undefined || !isLinkedStatus(r.status)) continue;
      const key = `${r.portal}/${r.owner.kind}/${r.status}`;
      const count = (counts.get(key)?.count ?? 0) + 1;
      counts.set(key, { portal: r.portal, ownerKind: r.owner.kind, status: r.status, count });
    }
    return Promise.resolve([...counts.values()]);
  }
}

function isLinkedStatus(status: string): status is LinkedListingStatus {
  return (LINKED_LISTING_STATUSES as readonly string[]).includes(status);
}

export const LISTED_PROPERTY_ID = '01920000-0000-7000-8000-0000000000b1';

/** Un departamento en venta, disponible, con todo lo que pide MercadoLibre. */
export function listingSource(overrides: Partial<ListingSource> = {}): ListingSource {
  return {
    propertyId: LISTED_PROPERTY_ID,
    code: 'DEP0001',
    kind: 'apartment',
    availability: 'active',
    developmentId: undefined,
    unitDesignation: undefined,
    title: 'Departamento en venta en Palermo',
    description: 'Luminoso, al frente.',
    operations: [
      { operation: 'sale', currency: 'USD', priceCents: 12_000_000n, priceOnRequest: false },
      { operation: 'rent', currency: 'ARS', priceCents: undefined, priceOnRequest: true },
    ],
    address: 'Gurruchaga al 1800',
    coordinates: { latitude: -34.588, longitude: -58.43 },
    location: { province: 'Capital Federal', city: 'Capital Federal', neighborhood: 'Palermo' },
    characteristics: {
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      toilets: undefined,
      parkingSpaces: undefined,
      ageYears: 10,
      orientation: 'north',
      disposition: undefined,
      isFurnished: false,
      professionalUse: false,
      surfaceTotalM2: 70,
      surfaceCoveredM2: 65,
      surfaceLandM2: undefined,
    },
    expensesCents: 8_000_000n,
    creditEligible: true,
    photos: [{ id: 'photo-1', version: '2026-10-01T00:00:00.000Z', url: 'https://signed/1' }],
    contact: {
      fromBranch: true,
      name: 'Casa central',
      email: 'ventas@norde.test',
      phone: '+541148000000',
      whatsapp: '+5491166000000',
    },
    ...overrides,
  };
}

export class FakeListingSourceReader implements ListingSourceReader {
  readonly sources = new Map<string, ListingSource>();

  read(propertyId: string) {
    return Promise.resolve(this.sources.get(propertyId));
  }
}

export const LISTED_DEVELOPMENT_ID = '01920000-0000-7000-8000-0000000000d1';
export const LISTED_UNIT_ID = '01920000-0000-7000-8000-0000000000c1';

/** Un emprendimiento comercializando, con una unidad disponible en venta. */
export function developmentListingSource(
  overrides: Partial<DevelopmentListingSource> = {},
): DevelopmentListingSource {
  return {
    developmentId: LISTED_DEVELOPMENT_ID,
    code: 'EMP0001',
    kind: 'building',
    name: 'Torre Mataderos',
    availability: 'active',
    title: 'Torre Mataderos',
    description: 'Un edificio de 10 pisos con amenities, a metros de la avenida y del parque.',
    address: 'Murguiondo al 2000',
    coordinates: { latitude: -34.65, longitude: -58.5 },
    location: { province: 'Capital Federal', city: 'Capital Federal', neighborhood: 'Mataderos' },
    stage: 'under_construction',
    deliveryDate: '2027-12-01',
    photos: [{ id: 'render-1', version: '2026-10-01T00:00:00.000Z', url: 'https://signed/r1' }],
    contact: {
      fromBranch: true,
      name: 'Casa central',
      email: 'ventas@norde.test',
      phone: '+541148000000',
      whatsapp: '+5491166000000',
    },
    units: [
      listingSource({
        propertyId: LISTED_UNIT_ID,
        code: 'AP0001',
        developmentId: LISTED_DEVELOPMENT_ID,
        unitDesignation: { floor: '3', unit: 'B' },
        title: 'Departamento 2 ambientes con balcón',
      }),
    ],
    ...overrides,
  };
}

export class FakeDevelopmentListingSourceReader implements DevelopmentListingSourceReader {
  readonly sources = new Map<string, DevelopmentListingSource>();

  read(developmentId: string) {
    return Promise.resolve(this.sources.get(developmentId));
  }
}

/**
 * Portal de prueba: guarda las llamadas, crea avisos `MLA<n>` y devuelve el estado pedido. Con
 * `failWith`, falla como el portal real; `problemsFound` simula datos faltantes.
 */
export class FakePortalConnector implements PortalConnector {
  readonly calls: {
    method: string;
    externalId?: string;
    content?: PortalListingContent;
    state?: string;
    kind?: ListingOwnerKind;
  }[] = [];
  failWith: PortalSyncError | undefined;
  problemsFound: string[] = [];
  /** Lo que devuelve `update`: por ejemplo `closed` si el aviso venció en el portal. */
  remoteState: PortalListingState | undefined;
  /** El link que devuelve `update`, si el portal lo informa. */
  remotePermalink: string | undefined;
  /** Por qué el portal dejó el aviso pausado (lo está moderando). */
  remoteReason: string | undefined;
  #next = 0;

  problems() {
    return this.problemsFound;
  }

  create(_portal: PortalId, content: PortalListingContent) {
    this.calls.push({ method: 'create', content });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    this.#next += 1;
    return Promise.resolve(
      ok({ externalId: `MLA${this.#next}`, permalink: `https://ml.test/MLA${this.#next}` }),
    );
  }

  update(
    _portal: PortalId,
    externalId: string,
    change: {
      readonly content: PortalListingContent;
      readonly contentChanged: boolean;
      readonly state: 'active' | 'paused';
    },
  ): Promise<Result<PortalListingUpdate, PortalSyncError>> {
    // Registra el contenido solo cuando cambió: es lo que el portal tiene que recibir.
    this.calls.push({
      method: 'update',
      externalId,
      ...(change.contentChanged ? { content: change.content } : {}),
      state: change.state,
    });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(
      ok({
        state: this.remoteState ?? change.state,
        permalink: this.remotePermalink,
        ...(this.remoteReason === undefined ? {} : { reason: this.remoteReason }),
      }),
    );
  }

  close(
    _portal: PortalId,
    externalId: string,
    kind: ListingOwnerKind,
  ): Promise<Result<void, PortalSyncError>> {
    this.calls.push({ method: 'close', externalId, kind });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(ok(undefined));
  }
}

/** Un aviso online del portal, de Tokko, para los tests de vinculación. */
export function remoteListing(overrides: Partial<RemoteListing> = {}): RemoteListing {
  return {
    remoteId: '50044229',
    code: 'PRO3621230',
    reference: 'NHO1142594',
    title: 'Casa 5 ambientes en Mataderos',
    operation: undefined,
    listingType: undefined,
    plan: 'HOME',
    location: 'Mataderos, Capital Federal, Argentina',
    permalink: 'https://portal.test/propiedades/clasificado/-50044229.html',
    isDevelopment: false,
    ...overrides,
  };
}

/** Un emprendimiento online del portal, de Tokko, con dos unidades. */
export function remoteDevelopment(overrides: Partial<RemoteDevelopment> = {}): RemoteDevelopment {
  return {
    remoteId: '59677897',
    code: 'DEV53838',
    reference: 'EMP0001',
    title: 'Torre Mataderos en construcción',
    plan: 'DESARROLLOS_HOME',
    location: 'Mataderos, Capital Federal, Argentina',
    permalink: 'https://portal.test/propiedades/clasificado/-59677897.html',
    units: [
      {
        remoteId: '59677898',
        code: 'DEV53838-EMP0001 AP0001',
        reference: 'AP0001',
        title: '2 amb',
      },
      {
        remoteId: '59677899',
        code: 'DEV53838-EMP0001 AP0002',
        reference: 'AP0002',
        title: '3 amb',
      },
    ],
    ...overrides,
  };
}

/** Catálogo de prueba: los avisos de `online` y lo que se vinculó con `link`. */
export class FakePortalListingCatalog implements PortalListingCatalog {
  listings: RemoteListing[] = [remoteListing()];
  developments: RemoteDevelopment[] = [remoteDevelopment()];
  readonly developmentLinks: {
    remoteId: string;
    listingId: string;
    units: readonly { readonly remoteId: string; readonly propertyId: string }[];
  }[] = [];
  total: number | undefined;
  failWith: { readonly type: 'PortalNotConfigured' | 'PortalUnavailable' } | undefined;
  linkFailWith: PortalSyncError | undefined;
  readonly pages: { offset: number; limit: number; remoteId?: string }[] = [];
  readonly links: { remoteId: string; listingId: string }[] = [];

  online(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }) {
    this.pages.push({
      offset: input.offset,
      limit: input.limit,
      ...(input.remoteId === undefined ? {} : { remoteId: input.remoteId }),
    });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    const all = this.listings.filter(
      (r) => input.remoteId === undefined || r.remoteId === input.remoteId,
    );
    return Promise.resolve(
      ok({
        items: all.slice(input.offset, input.offset + input.limit),
        total: this.total ?? all.length,
      }),
    );
  }

  link(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
  }) {
    this.links.push({ remoteId: input.remoteId, listingId: input.listingId });
    if (this.linkFailWith) return Promise.resolve(err(this.linkFailWith));
    return Promise.resolve(
      ok({
        externalId: input.listingId.replaceAll('-', ''),
        permalink: `https://portal.test/propiedades/clasificado/-${input.remoteId}.html`,
      }),
    );
  }

  onlineDevelopments(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }) {
    this.pages.push({
      offset: input.offset,
      limit: input.limit,
      ...(input.remoteId === undefined ? {} : { remoteId: input.remoteId }),
    });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    const all = this.developments.filter(
      (r) => input.remoteId === undefined || r.remoteId === input.remoteId,
    );
    return Promise.resolve(
      ok({
        items: all.slice(input.offset, input.offset + input.limit),
        total: this.total ?? all.length,
      }),
    );
  }

  linkDevelopment(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
    readonly units: readonly { readonly remoteId: string; readonly propertyId: string }[];
  }) {
    this.developmentLinks.push({
      remoteId: input.remoteId,
      listingId: input.listingId,
      units: input.units,
    });
    if (this.linkFailWith) return Promise.resolve(err(this.linkFailWith));
    return Promise.resolve(
      ok({
        externalId: input.listingId.replaceAll('-', ''),
        permalink: `https://portal.test/propiedades/clasificado/-${input.remoteId}.html`,
        linkedUnits: input.units.length,
      }),
    );
  }
}

/** Emprendimientos de prueba por código. */
export class FakeDevelopmentCodeLookup implements DevelopmentCodeLookup {
  readonly developments: DevelopmentByCode[] = [
    { developmentId: LISTED_DEVELOPMENT_ID, code: 'EMP0001', name: 'Torre Mataderos' },
  ];

  byCodes(codes: readonly string[]) {
    return Promise.resolve(this.developments.filter((d) => codes.includes(d.code)));
  }
}

/** Propiedades de prueba por código de referencia. */
export class FakePropertyCodeLookup implements PropertyCodeLookup {
  readonly properties: PropertyByCode[] = [
    {
      propertyId: LISTED_PROPERTY_ID,
      code: 'NHO1142594',
      title: 'Casa en Mataderos',
      developmentId: undefined,
    },
  ];
  readonly calls: (readonly string[])[] = [];

  byCodes(codes: readonly string[]) {
    this.calls.push(codes);
    return Promise.resolve(this.properties.filter((p) => codes.includes(p.code)));
  }
}

/** Un contacto de prueba que llegó por un aviso de Zonaprop. */
export function portalLead(overrides: Partial<PortalLead> = {}): PortalLead {
  return {
    externalId: '236161673',
    kind: 'message',
    receivedAt: new Date('2026-10-16T11:30:00Z'),
    name: 'Juli',
    email: 'juli@example.test',
    phone: '+5491165889654',
    message: 'Hola, me interesa esta propiedad.',
    listingCode: undefined,
    unitPropertyId: undefined,
    listingReference: undefined,
    ...overrides,
  };
}

/** Los contactos que devuelve el portal, de a páginas. */
export class FakePortalLeadSource implements PortalLeadSource {
  leads: PortalLead[] = [portalLead()];
  /**
   * Con grupos, el portal pagina por grupo (como los interesados de MercadoLibre, con varios
   * contactos cada uno) en vez de por contacto.
   */
  groups: PortalLead[][] | undefined;
  failWith: { readonly type: 'PortalNotConfigured' | 'PortalUnavailable' } | undefined;
  readonly calls: { since: Date; offset: number; limit: number; asksReceived: boolean }[] = [];

  recent(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly since: Date;
    readonly offset: number;
    readonly limit: number;
    readonly alreadyReceived?: (externalIds: readonly string[]) => Promise<ReadonlySet<string>>;
  }) {
    this.calls.push({
      since: input.since,
      offset: input.offset,
      limit: input.limit,
      asksReceived: input.alreadyReceived !== undefined,
    });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    if (this.groups) {
      const page = this.groups.slice(input.offset, input.offset + input.limit);
      return Promise.resolve(
        ok({
          items: page.flat(),
          total: this.groups.length,
          read: page.length,
          skipped: page.filter((g) => g.length === 0).length,
        }),
      );
    }
    return Promise.resolve(
      ok({
        items: this.leads.slice(input.offset, input.offset + input.limit),
        total: this.leads.length,
      }),
    );
  }
}

/** Bandeja de prueba: guarda lo que recibe y no duplica por `externalId`. */
export class FakePortalLeadSink implements PortalLeadSink {
  readonly received: Parameters<PortalLeadSink['receive']>[0][] = [];
  rejectWith: PortalLeadRejected | undefined;

  known(_channel: PortalLeadChannel, externalIds: readonly string[]) {
    const known = new Set(this.received.map((r) => r.externalId));
    return Promise.resolve(new Set(externalIds.filter((id) => known.has(id))));
  }

  receive(input: Parameters<PortalLeadSink['receive']>[0]) {
    if (this.rejectWith) return Promise.resolve(err(this.rejectWith));
    const duplicate = this.received.some((r) => r.externalId === input.externalId);
    if (!duplicate) this.received.push(input);
    return Promise.resolve(ok({ duplicate }));
  }
}

/** Avisos del portal de prueba: guarda a dónde se suscribió. */
export class FakePortalLeadNotifications implements PortalLeadNotifications {
  readonly subscriptions: Parameters<PortalLeadNotifications['subscribe']>[0][] = [];
  failWith: { readonly type: 'PortalNotConfigured' | 'PortalUnavailable' } | undefined;

  subscribe(input: Parameters<PortalLeadNotifications['subscribe']>[0]) {
    if (this.failWith) return Promise.resolve(err(this.failWith));
    this.subscriptions.push(input);
    return Promise.resolve(ok(undefined));
  }
}

/**
 * Estados de prueba de los avisos en el portal, por ID. Lo que no está en `remote` el portal no lo
 * informa. Con `failWith`, falla como el portal real.
 */
export class FakePortalListingStatsReader implements PortalListingStatsReader {
  result: PortalListingStats = {
    totalVisits: 950,
    visits: 120,
    questions: 3,
    phoneViews: 5,
    whatsapp: 8,
  };
  failWith: { readonly type: 'PortalUnavailable' | 'PortalCredentialsMissing' } | undefined;
  readonly reads: {
    readonly portal: PortalId;
    readonly externalId: string;
    readonly endingAt: Date;
    readonly days: number;
  }[] = [];

  stats(input: (typeof this.reads)[number]) {
    this.reads.push(input);
    return Promise.resolve(this.failWith ? err(this.failWith) : ok(this.result));
  }
}

export class FakePortalListingStateReader implements PortalListingStateReader {
  readonly remote = new Map<string, RemoteListingState>();
  failWith: { readonly type: 'PortalUnavailable' | 'PortalCredentialsMissing' } | undefined;
  readonly reads: (readonly string[])[] = [];

  states(_portal: PortalId, externalIds: readonly string[]) {
    this.reads.push(externalIds);
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(
      ok(
        new Map(
          externalIds.flatMap((id) => {
            const state = this.remote.get(id);
            return state === undefined ? [] : [[id, state] as const];
          }),
        ),
      ),
    );
  }
}

/** Paquetes de prueba de una cuenta de MercadoLibre. Con `failWith`, falla como el portal real. */
export class FakePortalPackageReader implements PortalPackageReader {
  available: readonly PortalPackage[] = [
    {
      id: '754985',
      name: 'Paquete 15 Básico',
      content: 'publications',
      expiresAt: new Date('2026-11-22T18:34:47.544Z'),
      quotas: [{ tier: 'silver', total: 15, used: 3, remaining: 12 }],
    },
  ];
  failWith: { readonly type: 'PortalUnavailable' | 'PortalCredentialsMissing' } | undefined;
  readonly reads: { portal: PortalId; externalAccountId: string }[] = [];

  packages(input: { readonly portal: PortalId; readonly externalAccountId: string }) {
    this.reads.push({ ...input });
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(ok(this.available));
  }
}
