// Fakes del módulo clients para tests (`@norde/core/clients/testing`).

import { Actor, Email, parseId, Phone, type WeightedAgent } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  ClientLetterCount,
  ClientListingSummary,
  ClientListRow,
  ClientTagGroupRow,
  ClientTagRef,
  ClientSavedSearchRow,
  ClientTabCounts,
  ClientTagRow,
  OpportunityStageCount,
  PropertyInterestProfile,
} from '../contracts';
import type { ClientAgents } from '../application/ports/client-agents';
import type { ClientErasure } from '../application/ports/client-erasure';
import type { ClientImportItem, ClientImportQuery } from '../application/ports/client-import-query';
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
import type { ClientActiveOpportunityItem } from '../application/ports/client-record-query';
import type {
  OpportunityBulkCriteria,
  OpportunityFilterCriteria,
  OpportunityListCriteria,
  OpportunityPipelineItem,
  OpportunityPipelineQuery,
} from '../application/ports/opportunity-pipeline-query';
import type { OpportunityNotification, TeamNotifier } from '../application/ports/team-notifier';
import type { BranchNames } from '../application/ports/branch-names';
import type {
  InquiryInboxCriteria,
  InquiryInboxItem,
  InquiryInboxQuery,
} from '../application/ports/inquiry-inbox-query';
import type { InquiryPropertyLookup } from '../application/ports/inquiry-property-lookup';
import type {
  InquiryRuleCriteria,
  InquiryRuleItem,
  InquiryRuleQuery,
} from '../application/ports/inquiry-rule-query';
import {
  ANY_INQUIRY,
  InquiryAssignmentRule,
  MAX_INQUIRY_RULES,
  type InquiryRuleConditions,
  type InquiryRuleId,
  type InquiryRuleSnapshot,
} from '../domain/inquiry-assignment-rule';
import type {
  InquiryMatchCriteria,
  InquiryMatchItem,
  InquiryMatchQuery,
} from '../application/ports/inquiry-match-query';
import { Client, type ClientId } from '../domain/client';
import {
  OpportunityBulkOperation,
  type OpportunityBulkOperationId,
  type OpportunityBulkOperationSnapshot,
} from '../domain/opportunity-bulk-operation';
import type { ClientActivity } from '../domain/client-activity';
import type { ErasureRecord } from '../domain/client-erasure';
import {
  ClientImport,
  type ClientImportId,
  type ClientImportSnapshot,
  type ImportRowProblem,
} from '../domain/client-import';
import { FeaturedListing } from '../domain/featured-listing';
import { Inquiry, type InquiryId, type InquirySnapshot } from '../domain/inquiry';
import type { InquiryPropertyFacts } from '../domain/inquiry-tags';
import {
  MAX_DUPLICATE_CANDIDATES,
  type ClientActivityRepository,
  type ClientImportRepository,
  type ClientRepository,
  type ClientTagGroupRepository,
  type ClientTagRepository,
  type FeaturedListingRepository,
  type InquiryRepository,
  type InquiryRuleRepository,
  type OpportunityCloseReasonRepository,
  type OpportunityBulkOperationRepository,
  type OpportunityRepository,
  type OpportunitySettingsRepository,
  type OpportunityStageRepository,
  type SavedSearchRepository,
} from '../domain/client.repository';
import {
  SavedSearch,
  type SavedSearchFields,
  type SavedSearchId,
  type SavedSearchSnapshot,
} from '../domain/saved-search';
import type { PropertyProfiles } from '../application/ports/property-interest-query';
import type { SavedSearchLocations } from '../application/ports/saved-search-locations';
import {
  ClientTag,
  ClientTagGroup,
  type ClientTagGroupId,
  type ClientTagId,
} from '../domain/client-tag';
import { normalizeName, type ContactKeys } from '../domain/duplicate-check';
import {
  Opportunity,
  type OpportunityId,
  type OpportunityStatusChange,
} from '../domain/opportunity';
import {
  OpportunityCloseReason,
  type OpportunityCloseReasonId,
} from '../domain/opportunity-close-reason';
import { NO_RULES, type OpportunityRules } from '../domain/opportunity-settings';
import { OpportunityStage, type OpportunityStageId } from '../domain/opportunity-stage';
import type { OpportunityStatus } from '../domain/opportunity-status';

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

  /** Historial de cambios de estado guardados, por oportunidad. */
  readonly statusChanges: (OpportunityStatusChange & { readonly changedBy: string })[] = [];

  save(opportunity: Opportunity, actorId: string) {
    this.rows.set(opportunity.id, opportunity.toSnapshot());
    for (const change of opportunity.pullStatusChanges()) {
      this.statusChanges.push({ ...change, changedBy: actorId });
    }
    return Promise.resolve();
  }

  hasStatusChangeFrom(sourceEventId: string) {
    return Promise.resolve(this.statusChanges.some((c) => c.sourceEventId === sourceEventId));
  }
}

export class InMemoryOpportunityBulkOperationRepository implements OpportunityBulkOperationRepository {
  readonly rows = new Map<string, OpportunityBulkOperationSnapshot>();

  findById(id: OpportunityBulkOperationId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && OpportunityBulkOperation.restore(row));
  }

  save(operation: OpportunityBulkOperation) {
    this.rows.set(operation.id, operation.toSnapshot());
    return Promise.resolve();
  }
}

/** Un ID fijo para los estados y motivos de prueba. */
function fixtureId<Brand extends string>(prefix: string, index: number) {
  const id = parseId<Brand>(
    `00000000-0000-7000-8000-${prefix}${index.toString().padStart(12 - prefix.length, '0')}`,
  );
  if (id.isErr()) throw new Error('invalid fixture id');
  return id.value;
}

const FIXTURE_TIME = new Date('2026-01-01T00:00:00Z');

/** Los estados de fábrica (uno por categoría, como el seed de la migración). */
export const DEFAULT_STAGES: readonly {
  readonly name: string;
  readonly category: OpportunityStatus;
  readonly color: string;
}[] = [
  { name: 'Nuevo', category: 'new', color: '#3b82f6' },
  { name: 'Contactado', category: 'contacted', color: '#06b6d4' },
  { name: 'Visitando', category: 'visiting', color: '#8b5cf6' },
  { name: 'Negociando', category: 'negotiating', color: '#f59e0b' },
  { name: 'Ganada', category: 'won', color: '#22c55e' },
  { name: 'Perdida', category: 'lost', color: '#ef4444' },
  { name: 'Aplica a otra inmobiliaria', category: 'referred_to_partner', color: '#64748b' },
];

export function stageFixtureId(index: number): OpportunityStageId {
  return fixtureId<'OpportunityStage'>('5', index);
}

export function closeReasonFixtureId(index: number): OpportunityCloseReasonId {
  return fixtureId<'OpportunityCloseReason'>('6', index);
}

export class InMemoryOpportunityStageRepository implements OpportunityStageRepository {
  readonly rows = new Map<string, ReturnType<OpportunityStage['toSnapshot']>>();

  /** Arranca con los estados de fábrica (`stageFixtureId(0)` es "Nuevo"). */
  constructor() {
    for (const [index, stage] of DEFAULT_STAGES.entries()) {
      this.rows.set(stageFixtureId(index), {
        id: stageFixtureId(index),
        ...stage,
        position: index,
        isActive: true,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      });
    }
  }

  findById(id: OpportunityStageId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && OpportunityStage.restore(row));
  }

  findAll() {
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.position - b.position)
        .map((row) => OpportunityStage.restore(row)),
    );
  }

  save(stage: OpportunityStage) {
    this.rows.set(stage.id, stage.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryOpportunityCloseReasonRepository implements OpportunityCloseReasonRepository {
  readonly rows = new Map<string, ReturnType<OpportunityCloseReason['toSnapshot']>>();

  /** Arranca con un motivo positivo (`closeReasonFixtureId(0)`) y uno negativo (`(1)`). */
  constructor() {
    const reasons = [
      { name: 'Compró o alquiló con Norde', rating: 'positive' },
      { name: 'Dejó de buscar', rating: 'negative' },
    ] as const;
    for (const [index, reason] of reasons.entries()) {
      this.rows.set(closeReasonFixtureId(index), {
        id: closeReasonFixtureId(index),
        ...reason,
        position: index,
        isActive: true,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      });
    }
  }

  findById(id: OpportunityCloseReasonId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && OpportunityCloseReason.restore(row));
  }

  findAll() {
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.position - b.position)
        .map((row) => OpportunityCloseReason.restore(row)),
    );
  }

  save(reason: OpportunityCloseReason) {
    this.rows.set(reason.id, reason.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryOpportunitySettingsRepository implements OpportunitySettingsRepository {
  rules: OpportunityRules = NO_RULES;

  get() {
    return Promise.resolve(this.rules);
  }

  save(rules: OpportunityRules) {
    this.rules = rules;
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

export class InMemorySavedSearchRepository implements SavedSearchRepository {
  readonly rows = new Map<string, SavedSearchSnapshot>();

  findById(id: SavedSearchId) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? SavedSearch.restore(row) : undefined);
  }

  findActiveByClient(clientId: ClientId, limit: number) {
    return Promise.resolve(
      this.activeRows(clientId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map((row) => SavedSearch.restore(row)),
    );
  }

  countActiveByClient(clientId: ClientId) {
    return Promise.resolve(this.activeRows(clientId).length);
  }

  save(search: SavedSearch) {
    this.rows.set(search.id, search.toSnapshot());
    return Promise.resolve();
  }

  private activeRows(clientId: string) {
    return [...this.rows.values()].filter(
      (row) => row.clientId === clientId && row.deletedAt === undefined,
    );
  }
}

/** Criterios de una búsqueda de prueba: venta, sin filtros. */
export function savedSearchFields(overrides: Partial<SavedSearchFields> = {}): SavedSearchFields {
  return {
    name: undefined,
    opportunityId: undefined,
    operation: 'sale',
    propertyTypes: [],
    currency: undefined,
    minPriceCents: undefined,
    maxPriceCents: undefined,
    locationIds: [],
    minRooms: undefined,
    autoSend: false,
    ...overrides,
  };
}

/** Guarda una búsqueda del cliente directamente en el fake. */
export function seedSavedSearch(
  uow: InMemoryClientsUnitOfWork,
  input: {
    readonly id: string;
    readonly clientId: string;
    readonly fields?: Partial<SavedSearchFields>;
    readonly snapshot?: Partial<SavedSearchSnapshot>;
  },
): SavedSearchSnapshot {
  const id = parseId<'SavedSearch'>(input.id);
  const clientId = parseId<'Client'>(input.clientId);
  if (id.isErr() || clientId.isErr()) throw new Error('ID de prueba inválido');
  const created = SavedSearch.create({
    id: id.value,
    clientId: clientId.value,
    fields: savedSearchFields(input.fields),
    now: new Date('2026-03-01T12:00:00Z'),
  });
  if (created.isErr()) throw new Error(`Búsqueda de prueba inválida: ${created.error.reason}`);
  const snapshot = { ...created.value.toSnapshot(), ...input.snapshot };
  uow.savedSearches.rows.set(snapshot.id, snapshot);
  return snapshot;
}

/** Los perfiles de cruce de las propiedades que ve cualquier actor con `properties:read`. */
export class InMemoryPropertyProfiles implements PropertyProfiles {
  constructor(public profiles: readonly PropertyInterestProfile[] = []) {}

  find(propertyId: string, actor: Actor) {
    return Promise.resolve(
      actor.can('properties:read')
        ? this.profiles.find((p) => p.propertyId === propertyId)
        : undefined,
    );
  }

  findMany(propertyIds: readonly string[], actor: Actor) {
    const visible = actor.can('properties:read') ? this.profiles : [];
    return Promise.resolve(
      new Map(
        visible.filter((p) => propertyIds.includes(p.propertyId)).map((p) => [p.propertyId, p]),
      ),
    );
  }
}

/** Nombres de ubicaciones de prueba. */
export class InMemorySavedSearchLocations implements SavedSearchLocations {
  constructor(public names: ReadonlyMap<string, string> = new Map()) {}

  labels(ids: readonly string[]) {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const name = this.names.get(id);
          return name === undefined ? [] : [[id, { id, name, hint: undefined }] as const];
        }),
      ),
    );
  }
}

/** Las importaciones y sus filas con problemas. */
export class InMemoryClientImportRepository implements ClientImportRepository {
  readonly rows = new Map<string, ClientImportSnapshot>();
  readonly problems: (ImportRowProblem & { readonly importId: string })[] = [];
  readonly savedBy = new Map<string, string>();

  findById(id: ClientImportId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && ClientImport.restore(row));
  }

  save(job: ClientImport, actorId: string) {
    this.rows.set(job.id, job.toSnapshot());
    this.savedBy.set(job.id, actorId);
    return Promise.resolve();
  }

  addProblem(importId: ClientImportId, problem: ImportRowProblem) {
    this.problems.push({ importId, ...problem });
    return Promise.resolve();
  }
}

/**
 * La supresión en memoria: borra las filas del cliente y las entradas de auditoría que lo
 * incluyen, como el adaptador real.
 */
export class InMemoryClientErasure implements ClientErasure {
  readonly records: ErasureRecord[] = [];
  readonly erased: string[] = [];

  constructor(
    private readonly clients: InMemoryClientRepository,
    private readonly activities: InMemoryClientActivityRepository,
    private readonly audit: InMemoryAuditLog,
  ) {}

  mergedInto(clientId: string, limit: number) {
    return Promise.resolve(
      [...this.clients.rows.values()]
        .filter((r) => r.mergedIntoId === clientId)
        .map((r) => r.id)
        .slice(0, limit),
    );
  }

  erase(clientIds: readonly string[]) {
    for (const id of clientIds) this.clients.rows.delete(id);
    for (const [id, activity] of this.activities.rows) {
      if (clientIds.includes(activity.clientId)) this.activities.rows.delete(id);
    }
    const kept = this.audit.entries.filter(
      (entry) => !entry.clientIds.some((id) => clientIds.includes(id)),
    );
    this.audit.entries.splice(0, this.audit.entries.length, ...kept);
    this.erased.push(...clientIds);
    return Promise.resolve();
  }

  record(record: ErasureRecord) {
    this.records.push(record);
    return Promise.resolve();
  }
}

/** Con el índice único por canal e ID externo de la base. */
export class InMemoryInquiryRepository implements InquiryRepository {
  readonly rows = new Map<string, InquirySnapshot>();
  readonly savedBy = new Map<string, string>();

  findById(id: InquiryId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Inquiry.restore(row));
  }

  findForUpdate(id: InquiryId) {
    return this.findById(id);
  }

  findByExternal(channel: string, externalId: string) {
    const row = [...this.rows.values()].find(
      (r) => r.channel === channel && r.externalId === externalId,
    );
    return Promise.resolve(row && Inquiry.restore(row));
  }

  /** Simula otra entrega que entró entre la búsqueda y el insert (la carrera que cubre la base). */
  racedBy: InquirySnapshot | undefined;

  insert(inquiry: Inquiry, actorId: string) {
    if (this.racedBy) {
      this.rows.set(this.racedBy.id, this.racedBy);
      this.racedBy = undefined;
    }
    const s = inquiry.toSnapshot();
    const taken = [...this.rows.values()].some(
      (r) => r.channel === s.channel && r.externalId === s.externalId,
    );
    if (taken) return Promise.resolve(false);
    this.rows.set(s.id, s);
    this.savedBy.set(s.id, actorId);
    return Promise.resolve(true);
  }

  save(inquiry: Inquiry, actorId: string) {
    this.rows.set(inquiry.id, inquiry.toSnapshot());
    this.savedBy.set(inquiry.id, actorId);
    return Promise.resolve();
  }
}

export class InMemoryInquiryRuleRepository implements InquiryRuleRepository {
  readonly rows = new Map<string, InquiryRuleSnapshot>();
  readonly locked: string[] = [];

  findById(id: InquiryRuleId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && InquiryAssignmentRule.restore(row));
  }

  findForUpdate(id: InquiryRuleId) {
    this.locked.push(id);
    return this.findById(id);
  }

  findAll() {
    return Promise.resolve(
      [...this.rows.values()]
        .slice(0, MAX_INQUIRY_RULES)
        .map((row) => InquiryAssignmentRule.restore(row)),
    );
  }

  save(rule: InquiryAssignmentRule) {
    this.rows.set(rule.id, rule.toSnapshot());
    return Promise.resolve();
  }

  delete(id: InquiryRuleId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryClientsUnitOfWork implements ClientsUnitOfWork {
  readonly clients = new InMemoryClientRepository();
  readonly opportunities = new InMemoryOpportunityRepository();
  readonly stages = new InMemoryOpportunityStageRepository();
  readonly closeReasons = new InMemoryOpportunityCloseReasonRepository();
  readonly opportunitySettings = new InMemoryOpportunitySettingsRepository();
  readonly tags = new InMemoryClientTagRepository(this.clients);
  readonly tagGroups = new InMemoryClientTagGroupRepository(this.tags);
  readonly records = new InMemoryClientLinkedRecords();
  readonly activities = new InMemoryClientActivityRepository();
  readonly featured = new InMemoryFeaturedListingRepository();
  readonly savedSearches = new InMemorySavedSearchRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();
  readonly erasure = new InMemoryClientErasure(this.clients, this.activities, this.audit);
  readonly imports = new InMemoryClientImportRepository();
  readonly bulkOperations = new InMemoryOpportunityBulkOperationRepository();
  readonly inquiries = new InMemoryInquiryRepository();
  readonly inquiryRules = new InMemoryInquiryRuleRepository();

  async run<T>(work: (tx: ClientsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      clients: new Map(this.clients.rows),
      opportunities: new Map(this.opportunities.rows),
      statusChanges: this.opportunities.statusChanges.length,
      stages: new Map(this.stages.rows),
      closeReasons: new Map(this.closeReasons.rows),
      rules: this.opportunitySettings.rules,
      tags: new Map(this.tags.rows),
      tagGroups: new Map(this.tagGroups.rows),
      records: new Map(this.records.counts),
      activities: new Map(this.activities.rows),
      featured: new Map(this.featured.rows),
      savedSearches: new Map(this.savedSearches.rows),
      imports: new Map(this.imports.rows),
      bulkOperations: new Map(this.bulkOperations.rows),
      inquiries: new Map(this.inquiries.rows),
      inquiryRules: new Map(this.inquiryRules.rows),
      problems: this.imports.problems.length,
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
      this.opportunities.statusChanges.splice(backup.statusChanges);
      restore(this.stages.rows, backup.stages);
      restore(this.closeReasons.rows, backup.closeReasons);
      this.opportunitySettings.rules = backup.rules;
      restore(this.tags.rows, backup.tags);
      restore(this.tagGroups.rows, backup.tagGroups);
      restore(this.records.counts, backup.records);
      restore(this.activities.rows, backup.activities);
      restore(this.featured.rows, backup.featured);
      restore(this.savedSearches.rows, backup.savedSearches);
      restore(this.imports.rows, backup.imports);
      restore(this.bulkOperations.rows, backup.bulkOperations);
      restore(this.inquiries.rows, backup.inquiries);
      restore(this.inquiryRules.rows, backup.inquiryRules);
      this.imports.problems.splice(backup.problems);
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
  readonly historyCriteria: Parameters<ClientRecordQuery['opportunityActivity']>[0][] = [];
  readonly opportunityCriteria: Parameters<ClientRecordQuery['opportunities']>[0][] = [];
  readonly featuredCriteria: Parameters<ClientRecordQuery['featured']>[0][] = [];
  readonly searchCriteria: Parameters<ClientRecordQuery['savedSearches']>[0][] = [];

  activityItems: readonly ClientActivityItem[] = [];
  opportunityItems: readonly ClientOpportunityItem[] = [];
  featuredItems: readonly ClientFeaturedItem[] = [];
  savedSearchRows: readonly ClientSavedSearchRow[] = [];
  counts: ClientTabCounts = NO_TAB_COUNTS;
  active: ClientActiveOpportunityItem | undefined = undefined;
  featuredIds: readonly string[] = [];

  activity(criteria: Parameters<ClientRecordQuery['activity']>[0]) {
    this.activityCriteria.push(criteria);
    return Promise.resolve({ items: this.activityItems, total: this.activityItems.length });
  }

  opportunityActivity(criteria: Parameters<ClientRecordQuery['opportunityActivity']>[0]) {
    this.historyCriteria.push(criteria);
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
    producer: undefined,
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

// ---------- Importación desde Excel ----------

/** El historial de importaciones sobre el repositorio en memoria. */
export class InMemoryClientImportQuery implements ClientImportQuery {
  constructor(private readonly imports: InMemoryClientImportRepository) {}

  list(query: {
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }) {
    const sorted = [...this.imports.rows.values()].sort(
      (a, b) =>
        (a.createdAt.getTime() - b.createdAt.getTime()) * (query.direction === 'asc' ? 1 : -1),
    );
    return Promise.resolve({
      items: sorted.slice(query.offset, query.offset + query.limit).map(toImportItem),
      total: sorted.length,
    });
  }

  find(importId: string) {
    const row = this.imports.rows.get(importId);
    return Promise.resolve(row && toImportItem(row));
  }

  problems(query: {
    readonly importId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }) {
    const rows = this.imports.problems
      .filter((p) => p.importId === query.importId)
      .sort((a, b) => (a.rowNumber - b.rowNumber) * (query.direction === 'asc' ? 1 : -1))
      .map(({ importId: _importId, ...problem }) => problem);
    return Promise.resolve({
      items: rows.slice(query.offset, query.offset + query.limit),
      total: rows.length,
    });
  }
}

function toImportItem(row: ClientImportSnapshot): ClientImportItem {
  const { storageKey: _key, mapping: _mapping, updatedAt: _updatedAt, ...item } = row;
  return item;
}

// ---------- Pipeline de oportunidades (#9, etapa 2) ----------

let opportunitySequence = 0;

/** Una oportunidad del contacto en uno de los estados de fábrica (`stageIndex`, 0 = Nuevo). */
export async function seedOpportunity(
  uow: InMemoryClientsUnitOfWork,
  client: Client,
  overrides: {
    readonly stageIndex?: number;
    readonly agentId?: string | undefined;
    readonly branchId?: string | undefined;
  } = {},
): Promise<Opportunity> {
  opportunitySequence += 1;
  const id = parseId<'Opportunity'>(
    `00000000-0000-7000-8000-7${opportunitySequence.toString().padStart(11, '0')}`,
  );
  const changeId = parseId<'OpportunityStatusChange'>(
    `00000000-0000-7000-8000-8${opportunitySequence.toString().padStart(11, '0')}`,
  );
  if (id.isErr() || changeId.isErr()) throw new Error('Invalid test fixture');
  const stage = await uow.stages.findById(stageFixtureId(overrides.stageIndex ?? 0));
  if (!stage) throw new Error('Unknown test stage');
  const { ownerId, ownerBranchId } = client.ownership;
  const opportunity = Opportunity.open({
    id: id.value,
    clientId: client.id,
    originChannel: 'whatsapp',
    type: 'sale',
    intent: 'visit',
    stage: stage.ref(),
    agent: {
      agentId: 'agentId' in overrides ? overrides.agentId : ownerId,
      branchId: 'branchId' in overrides ? overrides.branchId : ownerBranchId,
    },
    statusChangeId: changeId.value,
    propertyId: PROPERTY_ID,
    now: new Date('2026-02-01T10:00:00Z'),
  });
  opportunity.pullEvents();
  await uow.opportunities.save(opportunity, AGENT_ID);
  uow.opportunities.statusChanges.length = 0;
  return opportunity;
}

export function aPipelineItem(
  overrides: Partial<OpportunityPipelineItem> = {},
): OpportunityPipelineItem {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    clientId: '00000000-0000-7000-8000-0000000000f2',
    clientKind: 'person',
    clientName: 'Ana Pérez',
    clientTypes: [],
    clientPhone: '+5491166899124',
    type: 'sale',
    intent: 'visit',
    originChannel: 'whatsapp',
    status: 'new',
    stageId: stageFixtureId(0),
    propertyId: PROPERTY_ID,
    agentId: AGENT_ID,
    branchId: BRANCH_ID,
    statusChangedAt: new Date('2026-02-25T10:00:00Z'),
    lastNote: undefined,
    referral: { partnerName: undefined, referredAt: undefined, result: undefined },
    createdAt: new Date('2026-02-01T10:00:00Z'),
    updatedAt: new Date('2026-02-25T10:00:00Z'),
    ...overrides,
  };
}

/** Devuelve las filas cargadas y registra los criterios: el filtrado real es SQL en infra. */
export class StubOpportunityPipelineQuery implements OpportunityPipelineQuery {
  readonly searches: OpportunityListCriteria[] = [];
  readonly counts: OpportunityFilterCriteria[] = [];
  readonly assigned: { readonly agentId: string; readonly categories: readonly string[] }[] = [];
  stageCounts: OpportunityStageCount[] = [];
  pending = 0;

  constructor(public items: readonly OpportunityPipelineItem[] = []) {}

  search(criteria: OpportunityListCriteria) {
    this.searches.push(criteria);
    return Promise.resolve({
      items: this.items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: this.items.length,
    });
  }

  countByStage(criteria: OpportunityFilterCriteria) {
    this.counts.push(criteria);
    return Promise.resolve(this.stageCounts);
  }

  countAssigned(agentId: string, categories: readonly OpportunityStatus[]) {
    this.assigned.push({ agentId, categories });
    return Promise.resolve(this.pending);
  }

  /** Los IDs que "cumplen" la selección de una acción masiva (los carga el test). */
  matching: readonly string[] = [];
  readonly bulkCriteria: OpportunityBulkCriteria[] = [];

  count(criteria: OpportunityBulkCriteria) {
    this.bulkCriteria.push(criteria);
    return Promise.resolve(this.matching.length);
  }

  matchingIds(
    _criteria: OpportunityBulkCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ) {
    const { afterId } = page;
    const sorted = [...this.matching].sort();
    const from = afterId === undefined ? sorted : sorted.filter((id) => id > afterId);
    return Promise.resolve(from.slice(0, page.limit));
  }
}

// ---------- Consultas ----------

/** Las propiedades que conoce el lookup de consultas (las carga el test). */
export class InMemoryInquiryPropertyLookup implements InquiryPropertyLookup {
  readonly known = new Map<string, InquiryPropertyFacts>();

  facts(propertyId: string) {
    return Promise.resolve(this.known.get(propertyId.toLowerCase()));
  }
}

export class InMemoryBranchNames implements BranchNames {
  constructor(readonly entries: ReadonlyMap<string, string> = new Map()) {}

  names(ids: readonly string[]) {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const name = this.entries.get(id);
          return name === undefined ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}

export function anInquiryItem(overrides: Partial<InquiryInboxItem> = {}): InquiryInboxItem {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    channel: 'zonaprop',
    status: 'pending',
    receivedAt: new Date('2026-03-01T09:00:00Z'),
    senderName: 'Ana Pérez',
    senderEmail: 'ana@example.com',
    senderPhoneE164: '+5491166899124',
    message: 'Hola, ¿sigue disponible?',
    autoTags: ['channel:zonaprop'],
    propertyId: undefined,
    branchId: undefined,
    clientId: undefined,
    assignedAgentId: undefined,
    assignedAt: undefined,
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

/** Devuelve las filas cargadas y registra los criterios: el filtrado real es SQL en infra. */
export class StubInquiryInboxQuery implements InquiryInboxQuery {
  readonly searches: InquiryInboxCriteria[] = [];
  pending = 0;

  constructor(public items: readonly InquiryInboxItem[] = []) {}

  search(criteria: InquiryInboxCriteria) {
    this.searches.push(criteria);
    return Promise.resolve({
      items: this.items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: this.items.length,
    });
  }

  countPending() {
    return Promise.resolve(this.pending);
  }
}

export function anInquiryMatch(overrides: Partial<InquiryMatchItem> = {}): InquiryMatchItem {
  return {
    id: '00000000-0000-7000-8000-0000000000a1',
    name: 'Ana Pérez',
    companyName: undefined,
    agentId: undefined,
    branchId: undefined,
    matchedByPhone: true,
    matchedByEmail: false,
    createdAt: new Date('2026-01-10T12:00:00Z'),
    lastContactAt: undefined,
    deletedAt: undefined,
    ...overrides,
  };
}

/** Devuelve las filas cargadas y registra los criterios: la búsqueda real es SQL en infra. */
export class StubInquiryMatchQuery implements InquiryMatchQuery {
  readonly searches: InquiryMatchCriteria[] = [];

  constructor(public items: readonly InquiryMatchItem[] = []) {}

  search(criteria: InquiryMatchCriteria) {
    this.searches.push(criteria);
    return Promise.resolve({
      items: this.items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: this.items.length,
    });
  }
}

let ruleSequence = 0;

/** Una regla guardada, activa y última en la prioridad, con A (Camila) 2 y B (Martín) 1. */
export async function seedInquiryRule(
  uow: InMemoryClientsUnitOfWork,
  overrides: {
    readonly name?: string;
    readonly conditions?: Partial<InquiryRuleConditions>;
    readonly agents?: readonly WeightedAgent[];
    readonly active?: boolean;
    readonly position?: number;
  } = {},
): Promise<InquiryAssignmentRule> {
  ruleSequence += 1;
  const id = parseId<'InquiryAssignmentRule'>(
    `00000000-0000-7000-8000-6${ruleSequence.toString().padStart(11, '0')}`,
  );
  if (id.isErr()) throw new Error('Invalid test fixture');
  const created = InquiryAssignmentRule.create({
    id: id.value,
    name: overrides.name ?? `Regla ${String(ruleSequence)}`,
    conditions: { ...ANY_INQUIRY, ...overrides.conditions },
    agents: overrides.agents ?? [
      { userId: AGENT_ID, weight: 2 },
      { userId: OTHER_AGENT_ID, weight: 1 },
    ],
    existingCount: 0,
    nextPosition: overrides.position ?? uow.inquiryRules.rows.size,
    now: new Date('2026-02-01T10:00:00Z'),
  });
  if (created.isErr()) throw new Error(`Invalid test rule: ${created.error.type}`);
  if (overrides.active === false) created.value.setActive(false, new Date('2026-02-01T10:00:00Z'));
  await uow.inquiryRules.save(created.value);
  return created.value;
}

/** Devuelve las reglas cargadas y registra los criterios: el orden real es SQL en infra. */
export class StubInquiryRuleQuery implements InquiryRuleQuery {
  readonly searches: InquiryRuleCriteria[] = [];

  constructor(public items: readonly InquiryRuleItem[] = []) {}

  search(criteria: InquiryRuleCriteria) {
    this.searches.push(criteria);
    return Promise.resolve({
      items: this.items.slice(criteria.offset, criteria.offset + criteria.limit),
      total: this.items.length,
    });
  }
}
