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
import type {
  PortalAccountDirectory,
  PortalAccountLookupError,
  PortalAccountMatch,
  PortalCredit,
} from '../application/ports/portal-account-directory';
import type {
  PortalListingCatalog,
  PropertyByCode,
  PropertyCodeLookup,
  RemoteListing,
} from '../application/ports/portal-listing-catalog';
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
  Listing,
  type ListingId,
  type ListingOperation,
  type ListingSnapshot,
} from '../domain/listing';
import { PORTALS, type PortalId } from '../domain/portal';
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

  findById(id: ListingId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Listing.restore(row));
  }

  lockById(id: ListingId) {
    return this.findById(id);
  }

  findOne(portal: PortalId, propertyId: string, operation: ListingOperation | undefined) {
    const row = [...this.rows.values()].find(
      (r) => r.portal === portal && r.propertyId === propertyId && r.operation === operation,
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
        .filter((r) => r.propertyId === propertyId)
        .map((r) => Listing.restore(r)),
    );
  }

  save(listing: Listing) {
    this.rows.set(listing.id, listing.toSnapshot());
    return Promise.resolve();
  }
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
  }[] = [];
  failWith: PortalSyncError | undefined;
  problemsFound: string[] = [];
  /** Lo que devuelve `update`: por ejemplo `closed` si el aviso venció en el portal. */
  remoteState: PortalListingState | undefined;
  /** El link que devuelve `update`, si el portal lo informa. */
  remotePermalink: string | undefined;
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
      ok({ state: this.remoteState ?? change.state, permalink: this.remotePermalink }),
    );
  }

  close(_portal: PortalId, externalId: string): Promise<Result<void, PortalSyncError>> {
    this.calls.push({ method: 'close', externalId });
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
    plan: 'HOME',
    location: 'Mataderos, Capital Federal, Argentina',
    permalink: 'https://portal.test/propiedades/clasificado/-50044229.html',
    isDevelopment: false,
    ...overrides,
  };
}

/** Catálogo de prueba: los avisos de `online` y lo que se vinculó con `link`. */
export class FakePortalListingCatalog implements PortalListingCatalog {
  listings: RemoteListing[] = [remoteListing()];
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
