// Fakes del módulo clients para tests (`@norde/core/clients/testing`).

import { Actor, Email, parseId, Phone } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  ClientActiveOpportunity,
  ClientLetterCount,
  ClientListingSummary,
  ClientListRow,
  ClientTagGroupRow,
  ClientTagRef,
  ClientSavedSearchRow,
  ClientTabCounts,
  ClientTagRow,
} from '../contracts';
import type { ClientAgents } from '../application/ports/client-agents';
import type {
  ClientLinkedRecords,
  ClientRecordCounts,
} from '../application/ports/client-linked-records';
import type {
  ClientRelationItem,
  ClientRelationQuery,
} from '../application/ports/client-relation-query';
import type {
  ClientActivityItem,
  ClientFeaturedItem,
  ClientListings,
  ClientOpportunityItem,
  ClientRecordQuery,
} from '../application/ports/client-record-query';
import type { ClientTagQuery } from '../application/ports/client-tag-query';
import type {
  ClientExportFile,
  ClientExportWriter,
} from '../application/ports/client-export-writer';
import type {
  ClientFilterCriteria,
  ClientListCriteria,
  ClientListItem,
  ClientListQuery,
} from '../application/ports/client-list-query';
import type {
  ClientsTransaction,
  ClientsUnitOfWork,
} from '../application/ports/clients-transaction';
import type { OpportunityNotification, TeamNotifier } from '../application/ports/team-notifier';
import { Client, type ClientId } from '../domain/client';
import type { ClientActivity } from '../domain/client-activity';
import { FeaturedListing } from '../domain/featured-listing';
import {
  MAX_DUPLICATE_CANDIDATES,
  type ClientActivityRepository,
  type ClientRepository,
  type ClientTagGroupRepository,
  type ClientTagRepository,
  type FeaturedListingRepository,
  type OpportunityRepository,
} from '../domain/client.repository';
import {
  ClientTag,
  ClientTagGroup,
  type ClientTagGroupId,
  type ClientTagId,
} from '../domain/client-tag';
import { normalizeName, type ContactKeys } from '../domain/duplicate-check';
import { Opportunity, type OpportunityId } from '../domain/opportunity';

/** Guarda snapshots (no instancias), igual que una base: cada lectura devuelve un aggregate nuevo. */
export class InMemoryClientRepository implements ClientRepository {
  readonly rows = new Map<string, ReturnType<Client['toSnapshot']>>();

  findById(id: ClientId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Client.restore(row));
  }

  findMatching(contact: ContactKeys) {
    return Promise.resolve(
      [...this.rows.values()]
        .map((r) => Client.restore(r))
        .filter((c) => c.sharesContactWith(contact))
        .slice(0, MAX_DUPLICATE_CANDIDATES),
    );
  }

  findByName(name: string) {
    const key = normalizeName(name);
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.deletedAt === undefined && normalizeName(r.name ?? '').includes(key))
        .map((r) => Client.restore(r))
        .slice(0, MAX_DUPLICATE_CANDIDATES),
    );
  }

  /** Quién guardó cada cliente por última vez. */
  readonly savedBy = new Map<string, string>();

  save(client: Client, actorId: string) {
    this.rows.set(client.id, client.toSnapshot());
    this.savedBy.set(client.id, actorId);
    return Promise.resolve();
  }
}

export class InMemoryOpportunityRepository implements OpportunityRepository {
  readonly rows = new Map<string, ReturnType<Opportunity['toSnapshot']>>();

  findById(id: OpportunityId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Opportunity.restore(row));
  }

  findOpenByClient(clientId: ClientId) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.clientId === clientId)
        .map((r) => Opportunity.restore(r))
        .filter((o) => o.isOpen()),
    );
  }

  save(opportunity: Opportunity) {
    this.rows.set(opportunity.id, opportunity.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryClientTagGroupRepository implements ClientTagGroupRepository {
  readonly rows = new Map<string, ReturnType<ClientTagGroup['toSnapshot']>>();

  constructor(private readonly tags: InMemoryClientTagRepository) {}

  findById(id: ClientTagGroupId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && ClientTagGroup.restore(row));
  }

  findByName(name: string) {
    const row = [...this.rows.values()].find((r) => r.name.toLowerCase() === name.toLowerCase());
    return Promise.resolve(row && ClientTagGroup.restore(row));
  }

  nextPosition() {
    return Promise.resolve(Math.max(-1, ...[...this.rows.values()].map((r) => r.position)) + 1);
  }

  countTags(id: ClientTagGroupId) {
    return Promise.resolve([...this.tags.rows.values()].filter((t) => t.groupId === id).length);
  }

  save(group: ClientTagGroup) {
    this.rows.set(group.id, group.toSnapshot());
    return Promise.resolve();
  }

  delete(id: ClientTagGroupId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

/** Las asignaciones viven en los snapshots de los clientes (en la base, en otra tabla). */
export class InMemoryClientTagRepository implements ClientTagRepository {
  readonly rows = new Map<string, ReturnType<ClientTag['toSnapshot']>>();

  constructor(private readonly clients: InMemoryClientRepository) {}

  findById(id: ClientTagId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && ClientTag.restore(row));
  }

  findInGroup(groupId: ClientTagGroupId | undefined, name: string) {
    const row = [...this.rows.values()].find(
      (r) => r.groupId === groupId && r.name.toLowerCase() === name.toLowerCase(),
    );
    return Promise.resolve(row && ClientTag.restore(row));
  }

  findExistingIds(ids: readonly string[]) {
    return Promise.resolve(ids.filter((id) => this.rows.has(id)));
  }

  countUses(id: ClientTagId) {
    return Promise.resolve(
      [...this.clients.rows.values()].filter((c) => c.tagIds.includes(id)).length,
    );
  }

  moveAssignments(source: ClientTagId, target: ClientTagId) {
    let moved = 0;
    for (const [id, row] of this.clients.rows) {
      if (!row.tagIds.includes(source)) continue;
      moved += 1;
      const tagIds = [...new Set(row.tagIds.map((tag) => (tag === source ? target : tag)))];
      this.clients.rows.set(id, { ...row, tagIds });
    }
    return Promise.resolve(moved);
  }

  save(tag: ClientTag) {
    this.rows.set(tag.id, tag.toSnapshot());
    return Promise.resolve();
  }

  delete(id: ClientTagId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export const NO_RECORDS: ClientRecordCounts = {
  opportunities: 0,
  activities: 0,
  savedSearches: 0,
  featuredListings: 0,
  sharedListings: 0,
  inquiries: 0,
  incomingRelations: 0,
};

/** Cuántos registros cuelgan de cada cliente; moveAll los pasa de uno a otro. */
export class InMemoryClientLinkedRecords implements ClientLinkedRecords {
  readonly counts = new Map<string, ClientRecordCounts>();
  readonly moves: { readonly fromId: string; readonly toId: string }[] = [];

  countFor(clientId: string) {
    return Promise.resolve(this.counts.get(clientId) ?? NO_RECORDS);
  }

  moveAll(fromId: string, toId: string) {
    const moved = this.counts.get(fromId) ?? NO_RECORDS;
    const target = this.counts.get(toId) ?? NO_RECORDS;
    const sum: Record<keyof ClientRecordCounts, number> = { ...target };
    for (const field of Object.keys(NO_RECORDS) as (keyof ClientRecordCounts)[]) {
      sum[field] = target[field] + moved[field];
    }
    this.counts.set(toId, sum);
    this.counts.delete(fromId);
    this.moves.push({ fromId, toId });
    return Promise.resolve(moved);
  }
}

/** El timeline, con quién insertó cada entrada. */
export class InMemoryClientActivityRepository implements ClientActivityRepository {
  readonly rows = new Map<string, ClientActivity>();
  readonly addedBy = new Map<string, string>();

  add(activity: ClientActivity, actorId: string) {
    if (this.rows.has(activity.id)) throw new Error(`Duplicate activity ${activity.id}`);
    this.rows.set(activity.id, activity);
    this.addedBy.set(activity.id, actorId);
    return Promise.resolve();
  }

  record(activity: ClientActivity) {
    if (this.rows.has(activity.id)) return Promise.resolve(false);
    this.rows.set(activity.id, activity);
    return Promise.resolve(true);
  }

  of(clientId: string): ClientActivity[] {
    return [...this.rows.values()].filter((a) => a.clientId === clientId);
  }
}

export class InMemoryFeaturedListingRepository implements FeaturedListingRepository {
  readonly rows = new Map<string, ReturnType<FeaturedListing['toSnapshot']>>();

  findActive(clientId: ClientId, propertyIds: readonly string[]) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.clientId === clientId &&
            r.removedAt === undefined &&
            propertyIds.includes(r.propertyId),
        )
        .map((r) => FeaturedListing.restore(r)),
    );
  }

  save(listing: FeaturedListing) {
    this.rows.set(listing.id, listing.toSnapshot());
    return Promise.resolve();
  }

  activeFor(clientId: string): string[] {
    return [...this.rows.values()]
      .filter((r) => r.clientId === clientId && r.removedAt === undefined)
      .map((r) => r.propertyId);
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryClientsUnitOfWork implements ClientsUnitOfWork {
  readonly clients = new InMemoryClientRepository();
  readonly opportunities = new InMemoryOpportunityRepository();
  readonly tags = new InMemoryClientTagRepository(this.clients);
  readonly tagGroups = new InMemoryClientTagGroupRepository(this.tags);
  readonly records = new InMemoryClientLinkedRecords();
  readonly activities = new InMemoryClientActivityRepository();
  readonly featured = new InMemoryFeaturedListingRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: ClientsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      clients: new Map(this.clients.rows),
      opportunities: new Map(this.opportunities.rows),
      tags: new Map(this.tags.rows),
      tagGroups: new Map(this.tagGroups.rows),
      records: new Map(this.records.counts),
      activities: new Map(this.activities.rows),
      featured: new Map(this.featured.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const restore = <K, V>(target: Map<K, V>, saved: Map<K, V>) => {
      target.clear();
      for (const [k, v] of saved) target.set(k, v);
    };
    const rollback = () => {
      restore(this.clients.rows, backup.clients);
      restore(this.opportunities.rows, backup.opportunities);
      restore(this.tags.rows, backup.tags);
      restore(this.tagGroups.rows, backup.tagGroups);
      restore(this.records.counts, backup.records);
      restore(this.activities.rows, backup.activities);
      restore(this.featured.rows, backup.featured);
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

export class RecordingTeamNotifier implements TeamNotifier {
  readonly notifications: OpportunityNotification[] = [];

  notifyOpportunity(notification: OpportunityNotification) {
    this.notifications.push(notification);
    return Promise.resolve();
  }
}

// ---------- Agenda de contactos ----------

export const BRANCH_ID = '00000000-0000-7000-8000-0000000000b1';
export const OTHER_BRANCH_ID = '00000000-0000-7000-8000-0000000000b2';
export const AGENT_ID = '00000000-0000-7000-8000-0000000000c1';
export const OTHER_AGENT_ID = '00000000-0000-7000-8000-0000000000c2';

/** Agente con sus contactos: los ve, crea, edita y borra. */
export const TEST_AGENT = Actor.user(AGENT_ID, [
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'audit:read',
])
  .withBranch(BRANCH_ID)
  .withCorrelation('req-1');
/** Otro agente de otra sucursal, con los mismos permisos sobre lo suyo. */
export const TEST_OTHER_AGENT = Actor.user(OTHER_AGENT_ID, [
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
]).withBranch(OTHER_BRANCH_ID);
/** Gerente: todo sobre contactos y su historial. */
export const TEST_MANAGER = Actor.user('00000000-0000-7000-8000-0000000000c3', [
  'clients:*',
  'audit:*',
]);
/** Sin permisos sobre contactos. */
export const TEST_OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000c4', [
  'properties:read',
]);

/** Usuarios activos con su nombre y sucursal. */
export class InMemoryClientAgents implements ClientAgents {
  constructor(
    private readonly users: ReadonlyMap<
      string,
      { readonly name: string; readonly branchId: string | undefined }
    > = new Map([
      [AGENT_ID, { name: 'Camila', branchId: BRANCH_ID }],
      [OTHER_AGENT_ID, { name: 'Martín', branchId: OTHER_BRANCH_ID }],
    ]),
  ) {}

  names(ids: readonly string[]) {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const user = this.users.get(id);
          return user === undefined ? [] : [[id, user.name] as const];
        }),
      ),
    );
  }

  find(userId: string) {
    const user = this.users.get(userId);
    return Promise.resolve(user && { branchId: user.branchId });
  }
}

/** Devuelve las filas que se le cargan y registra los criterios: el filtrado real es SQL en infra. */
export class StubClientListQuery implements ClientListQuery {
  readonly searches: ClientListCriteria[] = [];
  readonly counts: ClientFilterCriteria[] = [];

  constructor(public items: readonly ClientListItem[] = []) {}

  search(criteria: ClientListCriteria) {
    this.searches.push(criteria);
    return Promise.resolve({
      items: this.items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: this.items.length,
    });
  }

  count(criteria: ClientFilterCriteria) {
    this.counts.push(criteria);
    return Promise.resolve(this.items.length);
  }

  readonly letterCriteria: ClientFilterCriteria[] = [];
  letterCounts: ClientLetterCount[] = [];

  letters(criteria: ClientFilterCriteria) {
    this.letterCriteria.push(criteria);
    return Promise.resolve(this.letterCounts);
  }
}

/** Devuelve las filas cargadas y registra los criterios. */
export class StubClientTagQuery implements ClientTagQuery {
  readonly groupCriteria: Parameters<ClientTagQuery['listGroups']>[0][] = [];
  readonly tagCriteria: Parameters<ClientTagQuery['searchTags']>[0][] = [];

  constructor(
    public groups: readonly ClientTagGroupRow[] = [],
    public tags: readonly ClientTagRow[] = [],
  ) {}

  listGroups(criteria: Parameters<ClientTagQuery['listGroups']>[0]) {
    this.groupCriteria.push(criteria);
    return Promise.resolve({ items: this.groups, total: this.groups.length });
  }

  searchTags(criteria: Parameters<ClientTagQuery['searchTags']>[0]) {
    this.tagCriteria.push(criteria);
    return Promise.resolve({ items: this.tags, total: this.tags.length });
  }

  refs(ids: readonly string[]) {
    return Promise.resolve(
      this.tags
        .filter((tag) => ids.includes(tag.id))
        .map((tag): ClientTagRef => ({ id: tag.id, name: tag.name, groupName: tag.groupName })),
    );
  }
}

export class StubClientRelationQuery implements ClientRelationQuery {
  readonly criteria: Parameters<ClientRelationQuery['list']>[0][] = [];

  constructor(public items: readonly ClientRelationItem[] = []) {}

  list(criteria: Parameters<ClientRelationQuery['list']>[0]) {
    this.criteria.push(criteria);
    return Promise.resolve({ items: this.items, total: this.items.length });
  }
}

export function aClientItem(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    id: '00000000-0000-7000-8000-0000000000d1',
    kind: 'person',
    name: 'Ana Pérez',
    companyName: undefined,
    phone: '+541147770000',
    mobile: '+5491166899124',
    email: 'ana@mail.com',
    clientTypes: [],
    agentId: AGENT_ID,
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-02T10:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

export class FakeClientExportWriter implements ClientExportWriter {
  readonly rows: ClientListRow[] = [];

  write(batches: AsyncIterable<readonly ClientListRow[]>): ClientExportFile {
    const rows = this.rows;
    async function* body(): AsyncIterable<Uint8Array> {
      for await (const batch of batches) {
        rows.push(...batch);
        yield new Uint8Array();
      }
    }
    return { filename: 'contactos.xlsx', contentType: 'text/plain', body: body() };
  }
}

let seedSequence = 0;

/**
 * Guarda un contacto creado desde el panel, a cargo de `TEST_AGENT` salvo que se indique otra
 * cosa. Los teléfonos y emails van como texto.
 */
export async function seedClient(
  uow: InMemoryClientsUnitOfWork,
  overrides: {
    readonly name?: string;
    readonly phones?: readonly string[];
    readonly emails?: readonly string[];
    readonly kind?: Parameters<typeof Client.create>[0]['kind'];
    readonly clientTypes?: Parameters<typeof Client.create>[0]['clientTypes'];
    readonly agentId?: string | undefined;
    readonly branchId?: string | undefined;
    readonly deleted?: boolean;
  } = {},
): Promise<Client> {
  seedSequence += 1;
  const id = parseId<'Client'>(
    `00000000-0000-7000-8000-9${seedSequence.toString().padStart(11, '0')}`,
  );
  if (id.isErr()) throw new Error('Invalid test fixture');
  const phones = (overrides.phones ?? ['+5491166899124']).map((raw) => {
    const phone = Phone.create(raw);
    if (phone.isErr()) throw new Error(`Invalid test phone ${raw}`);
    return { kind: 'mobile' as const, phone: phone.value, contactHours: undefined };
  });
  const emails = (overrides.emails ?? []).map((raw) => {
    const email = Email.create(raw);
    if (email.isErr()) throw new Error(`Invalid test email ${raw}`);
    return { kind: 'main' as const, email: email.value };
  });
  const created = Client.create({
    id: id.value,
    kind: overrides.kind ?? 'person',
    name: overrides.name ?? 'Ana Pérez',
    phones,
    emails,
    clientTypes: overrides.clientTypes ?? [],
    agentId: 'agentId' in overrides ? overrides.agentId : AGENT_ID,
    branchId: 'branchId' in overrides ? overrides.branchId : BRANCH_ID,
    profile: {},
    now: new Date('2026-02-01T10:00:00Z'),
  });
  if (created.isErr()) throw new Error('Invalid test fixture');
  const client = created.value;
  client.pullEvents();
  if (overrides.deleted === true) client.delete(AGENT_ID, new Date('2026-02-02T10:00:00Z'));
  client.pullEvents();
  await uow.clients.save(client, AGENT_ID);
  return client;
}

// ---------- Ficha completa (etapa 3) ----------

export const NO_TAB_COUNTS: ClientTabCounts = {
  activity: 0,
  opportunities: 0,
  featured: 0,
  savedSearches: 0,
  relations: 0,
};

/**
 * Devuelve lo que se le carga y registra los criterios. La actividad y las destacadas pueden
 * venir de los repositorios en memoria (lo que escribieron los commands).
 */
export class StubClientRecordQuery implements ClientRecordQuery {
  readonly activityCriteria: Parameters<ClientRecordQuery['activity']>[0][] = [];
  readonly opportunityCriteria: Parameters<ClientRecordQuery['opportunities']>[0][] = [];
  readonly featuredCriteria: Parameters<ClientRecordQuery['featured']>[0][] = [];
  readonly searchCriteria: Parameters<ClientRecordQuery['savedSearches']>[0][] = [];

  activityItems: readonly ClientActivityItem[] = [];
  opportunityItems: readonly ClientOpportunityItem[] = [];
  featuredItems: readonly ClientFeaturedItem[] = [];
  savedSearchRows: readonly ClientSavedSearchRow[] = [];
  counts: ClientTabCounts = NO_TAB_COUNTS;
  active: ClientActiveOpportunity | undefined = undefined;
  featuredIds: readonly string[] = [];

  activity(criteria: Parameters<ClientRecordQuery['activity']>[0]) {
    this.activityCriteria.push(criteria);
    return Promise.resolve({ items: this.activityItems, total: this.activityItems.length });
  }

  opportunities(criteria: Parameters<ClientRecordQuery['opportunities']>[0]) {
    this.opportunityCriteria.push(criteria);
    return Promise.resolve({ items: this.opportunityItems, total: this.opportunityItems.length });
  }

  readonly openStatuses: (readonly string[])[] = [];

  activeOpportunity(_clientId: string, openStatuses: readonly string[]) {
    this.openStatuses.push(openStatuses);
    return Promise.resolve(this.active);
  }

  featured(criteria: Parameters<ClientRecordQuery['featured']>[0]) {
    this.featuredCriteria.push(criteria);
    return Promise.resolve({ items: this.featuredItems, total: this.featuredItems.length });
  }

  featuredPropertyIds(_clientId: string, propertyIds: readonly string[]) {
    return Promise.resolve(this.featuredIds.filter((id) => propertyIds.includes(id)));
  }

  savedSearches(criteria: Parameters<ClientRecordQuery['savedSearches']>[0]) {
    this.searchCriteria.push(criteria);
    return Promise.resolve({ items: this.savedSearchRows, total: this.savedSearchRows.length });
  }

  tabCounts() {
    return Promise.resolve(this.counts);
  }
}

export const PROPERTY_ID = '00000000-0000-7000-8000-0000000000e1';
export const OTHER_PROPERTY_ID = '00000000-0000-7000-8000-0000000000e2';

export function aListing(overrides: Partial<ClientListingSummary> = {}): ClientListingSummary {
  return {
    id: PROPERTY_ID,
    code: 'NOR-001',
    title: 'Departamento 3 ambientes en Palermo',
    address: 'Gorriti 4500',
    status: 'available',
    operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    coverImageUrl: undefined,
    ...overrides,
  };
}

/** Las propiedades de la cartera que ve cualquier actor con `properties:read`. */
export class InMemoryClientListings implements ClientListings {
  readonly requests: { readonly ids: readonly string[]; readonly actor: Actor }[] = [];

  constructor(
    public listings: readonly ClientListingSummary[] = [
      aListing(),
      aListing({ id: OTHER_PROPERTY_ID, code: 'NOR-002' }),
    ],
  ) {}

  summaries(propertyIds: readonly string[], actor: Actor) {
    this.requests.push({ ids: propertyIds, actor });
    const visible = actor.can('properties:read') ? this.listings : [];
    return Promise.resolve(
      new Map(visible.filter((l) => propertyIds.includes(l.id)).map((l) => [l.id, l] as const)),
    );
  }
}
