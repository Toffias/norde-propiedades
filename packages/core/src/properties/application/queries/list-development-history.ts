import type { AuditHistoryQuery, HistoryEntryRow } from '../../../audit';
import { canActOn, OWNERSHIP_RULES } from '../../../identity';
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
import {
  ListDevelopmentHistoryQuerySchema,
  type DevelopmentHistoryCategory,
  type ListDevelopmentHistoryQuery,
} from '../../contracts';
import { findDevelopment, type DevelopmentNotFoundError } from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListDevelopmentHistoryError =
  ForbiddenError | InvalidInputError | DevelopmentNotFoundError;

/** Qué entradas muestra cada filtro. */
const CATEGORIES: Readonly<Record<DevelopmentHistoryCategory, readonly string[]>> = {
  fields: ['development.created', 'development.updated'],
  status: ['development.status_changed', 'development.deleted', 'development.restored'],
  units: [
    'development.unit_added',
    'development.units_exported',
    'development.units_import_requested',
    'development.units_imported',
    'development.units_import_failed',
  ],
  media: [
    'development.media_added',
    'development.media_updated',
    'development.media_reordered',
    'development.cover_changed',
    'development.media_deleted',
    'development.attachment_added',
    'development.attachment_updated',
    'development.attachment_deleted',
  ],
  assignments: ['development.tags_changed'],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/**
 * La pestaña Historial (la "Actividad" de Tokko): quién cambió qué y cuándo, paginada y filtrable.
 * Ver el historial de lo propio pide `audit:read`; el de otros, `audit:read-others`.
 */
export class ListDevelopmentHistory {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly history: AuditHistoryQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListDevelopmentHistoryQuery,
    actor: Actor,
  ): Promise<Result<Page<HistoryEntryRow>, ListDevelopmentHistoryError>> {
    const rule = OWNERSHIP_RULES.auditRead;
    if (!actor.can('developments:read') || !(actor.can(rule.own) || actor.can(rule.all))) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListDevelopmentHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const development = await this.deps.uow.run((tx) =>
      findDevelopment(tx.developments, query.developmentId),
    );
    if (!development) return err({ type: 'DevelopmentNotFound' });
    if (!canActOn(actor, rule, development.ownership)) return err({ type: 'Forbidden' });

    const { page, pageSize } = query;
    const slice = await this.deps.history.list({
      entityType: 'development',
      entityId: development.id,
      actions: query.category === undefined ? undefined : CATEGORIES[query.category],
      fields: undefined,
      actorId: query.actorId,
      from: query.from === undefined ? undefined : startOfDay(query.from),
      to: query.to === undefined ? undefined : new Date(startOfDay(query.to).getTime() + DAY_MS),
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.users.names([
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
