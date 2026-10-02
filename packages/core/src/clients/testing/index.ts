// Fakes del módulo clients para tests (`@norde/core/clients/testing`).

import { Actor, Email, parseId, Phone } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type { ClientListRow } from '../contracts';
import type { ClientAgents } from '../application/ports/client-agents';
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
import {
  MAX_DUPLICATE_CANDIDATES,
  type ClientRepository,
  type OpportunityRepository,
} from '../domain/client.repository';
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

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryClientsUnitOfWork implements ClientsUnitOfWork {
  readonly clients = new InMemoryClientRepository();
  readonly opportunities = new InMemoryOpportunityRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: ClientsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      clients: new Map(this.clients.rows),
      opportunities: new Map(this.opportunities.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.clients.rows.clear();
      for (const [k, v] of backup.clients) this.clients.rows.set(k, v);
      this.opportunities.rows.clear();
      for (const [k, v] of backup.opportunities) this.opportunities.rows.set(k, v);
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
    kind: 'person',
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
