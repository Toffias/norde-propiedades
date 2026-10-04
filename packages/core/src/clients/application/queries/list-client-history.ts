import type { AuditHistoryQuery, HistoryEntryRow } from '../../../audit';
import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import { ListClientHistoryQuerySchema, type ListClientHistoryQuery } from '../../contracts';
import { MAX_ERASED_MERGED_CLIENTS } from '../../domain/client-erasure';
import {
  canReadClients,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ListClientHistoryError = ForbiddenError | InvalidInputError | ClientNotFoundError;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/**
 * La pestaña Historial de la ficha: quién cambió qué y cuándo, paginada. El de sus contactos pide
 * `audit:read`; el de otros, `audit:read-others`.
 */
export class ListClientHistory {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly history: AuditHistoryQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListClientHistoryQuery,
    actor: Actor,
  ): Promise<Result<Page<HistoryEntryRow>, ListClientHistoryError>> {
    const rule = OWNERSHIP_RULES.auditRead;
    if (!canReadClients(actor) || accessScope(actor, rule) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListClientHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const found = await this.deps.uow.run(async (tx) => {
      const client = await findClient(tx.clients, query.clientId);
      // Los contactos que se le unificaron: su historial pasa a ser parte del suyo.
      const merged = client
        ? await tx.erasure.mergedInto(client.id, MAX_ERASED_MERGED_CLIENTS)
        : [];
      return client && { client, merged };
    });
    if (!found) return err({ type: 'ClientNotFound' });
    const { client, merged } = found;
    if (
      !canActOn(actor, OWNERSHIP_RULES.clientsRead, client.ownership) ||
      !canActOn(actor, rule, client.ownership)
    ) {
      return err({ type: 'Forbidden' });
    }

    const { page, pageSize } = query;
    const slice = await this.deps.history.list({
      entityType: 'client',
      entityId: client.id,
      mergedEntityIds: merged,
      actions: undefined,
      fields: undefined,
      actorId: query.actorId,
      from: query.from === undefined ? undefined : startOfDay(query.from),
      to: query.to === undefined ? undefined : new Date(startOfDay(query.to).getTime() + DAY_MS),
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.agents.names([
      ...new Set(slice.items.map((entry) => entry.actorId)),
    ]);
    const items = slice.items.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      actor: { id: entry.actorId, name: names.get(entry.actorId) },
      source: entry.source,
      action: entry.action,
      changes: entry.changes,
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
