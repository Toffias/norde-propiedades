import {
  auditAction,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ExportReservationsInputSchema,
  MAX_RESERVATION_EXPORT_ROWS,
  type ExportReservationsInput,
  type ReservationListRow,
} from '../../contracts';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ExportFile } from '../ports/property-export-writer';
import type { ReservationExportWriter } from '../ports/reservation-export-writer';
import type {
  ReservationFilterCriteria,
  ReservationListQuery,
} from '../ports/reservation-list-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { reservationCriteria } from '../reservation-filter';
import { withUserNames } from '../reservation-rows';

export type ExportReservationsError =
  | ForbiddenError
  | InvalidInputError
  | { readonly type: 'NothingToExport' }
  | { readonly type: 'TooManyToExport'; readonly max: number; readonly total: number };

/** Filas por consulta: la planilla se arma de a lotes, sin cargar todo en memoria. */
const BATCH_SIZE = 500;

/**
 * Exporta a Excel las reservas que cumplen los filtros. Pide `reservations:export` y queda en la
 * auditoría con los filtros y la cantidad.
 */
export class ExportReservations {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reservations: ReservationListQuery;
      readonly users: UserNames;
      readonly writer: ReservationExportWriter;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ExportReservationsInput,
    actor: Actor,
  ): Promise<Result<ExportFile, ExportReservationsError>> {
    if (!actor.can('reservations:export') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ExportReservationsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const criteria = reservationCriteria(parsed.data.filter);

    const total = await this.deps.reservations.count(criteria);
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > MAX_RESERVATION_EXPORT_ROWS) {
      return err({ type: 'TooManyToExport', max: MAX_RESERVATION_EXPORT_ROWS, total });
    }

    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          {
            action: 'reservation.exported',
            entityType: 'reservation_export',
            entityId: 'xlsx',
            clientIds: [],
          },
          {
            count: { before: null, after: total },
            filter: { before: null, after: toAuditValue(parsed.data.filter) },
          },
        ),
      ),
    );

    return ok(this.deps.writer.write(this.batches(criteria, total), { generatedAt: now }));
  }

  private async *batches(
    criteria: ReservationFilterCriteria,
    total: number,
  ): AsyncIterable<readonly ReservationListRow[]> {
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const slice = await this.deps.reservations.search({
        ...criteria,
        sort: { field: 'reservedAt', direction: 'asc' },
        offset,
        limit: Math.min(BATCH_SIZE, total - offset),
      });
      if (slice.items.length === 0) return;
      yield await withUserNames(this.deps.users, slice.items);
    }
  }
}
