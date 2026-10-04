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
  ListPropertyHistoryQuerySchema,
  type ListPropertyHistoryQuery,
  type PropertyHistoryCategory,
} from '../../contracts';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { UserNames } from '../ports/user-names';
import {
  findProperty,
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type ListPropertyHistoryError = ForbiddenError | InvalidInputError | PropertyNotFoundError;

/** Qué entradas muestra cada filtro: por acción, o por el campo que tocan (el precio). */
const CATEGORIES: Readonly<
  Record<
    PropertyHistoryCategory,
    { readonly actions?: readonly string[]; readonly fields?: readonly string[] }
  >
> = {
  fields: { actions: ['property.created', 'property.updated'] },
  price: { fields: ['operations'] },
  status: { actions: ['property.status_changed', 'property.deleted', 'property.restored'] },
  media: {
    actions: [
      'property.media_added',
      'property.media_updated',
      'property.media_reordered',
      'property.media_deleted',
      'property.cover_changed',
    ],
  },
  files: {
    actions: [
      'property.attachment_added',
      'property.attachment_updated',
      'property.attachment_deleted',
    ],
  },
  publication: { actions: ['property.publication_changed'] },
  assignments: { actions: ['property.producer_changed', 'property.tags_changed'] },
  reservations: {
    actions: [
      'property.reserved',
      'property.reservation_updated',
      'property.reservation_fallen',
      'property.reservation_signed',
      'property.reservation_erased',
      'property.client_merged',
    ],
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/**
 * La pestaña Historial: quién cambió qué y cuándo, paginada y filtrable por tipo de cambio, autor
 * y fechas. Ver el historial de lo propio pide `audit:read`; el de otros, `audit:read-others`.
 */
export class ListPropertyHistory {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly history: AuditHistoryQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListPropertyHistoryQuery,
    actor: Actor,
  ): Promise<Result<Page<HistoryEntryRow>, ListPropertyHistoryError>> {
    const rule = OWNERSHIP_RULES.auditRead;
    if (!actor.can('properties:read') || !(actor.can(rule.own) || actor.can(rule.all))) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListPropertyHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const property = await this.deps.uow.run((tx) => findProperty(tx.properties, query.propertyId));
    if (!property) return err({ type: 'PropertyNotFound' });
    if (!canActOn(actor, rule, property.ownership)) return err({ type: 'Forbidden' });

    const category = query.category === undefined ? undefined : CATEGORIES[query.category];
    const { page, pageSize } = query;
    const slice = await this.deps.history.list({
      entityType: 'property',
      entityId: property.id,
      actions: category?.actions,
      fields: category?.fields,
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
