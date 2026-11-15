import { canActOn, OWNERSHIP_RULES } from '../../identity';
import {
  err,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { Currency } from '../contracts';
import type { Property } from '../domain/property';
import type { Reservation, ReservationAmount, ReservationTerms } from '../domain/reservation';
import type { ReservationRepository } from '../domain/reservation.repository';
import type { PropertiesTransaction } from './ports/properties-transaction';
import type { ReservationParties } from './ports/reservation-parties';
import type { Producers } from './ports/user-names';
import { findProperty, type PropertyNotFoundError } from './property-support';

// Lo que comparten los commands de reservas: auditoría, búsqueda y armado de los términos.

export interface ReservationNotFoundError {
  readonly type: 'ReservationNotFound';
}
export interface AgentNotFoundError {
  readonly type: 'AgentNotFound';
}
export interface ManagerNotFoundError {
  readonly type: 'ManagerNotFound';
}

/** Los términos tal como llegan del contract (montos ya en centavos). */
export interface TermsInput {
  readonly managerUserId?: string | undefined;
  readonly amount?: bigint | undefined;
  readonly currency?: Currency | undefined;
  readonly commissionPct?: number | undefined;
  readonly commissionAmount?: bigint | undefined;
  readonly commissionCurrency?: Currency | undefined;
  readonly estimatedSigningDate?: string | undefined;
  readonly notes?: string | undefined;
}

function money(
  cents: bigint | undefined,
  currency: Currency | undefined,
): ReservationAmount | undefined {
  return cents === undefined || currency === undefined ? undefined : { cents, currency };
}

/**
 * Arma los términos: el agente (con su sucursal) y el gerente tienen que ser usuarios activos. Al
 * editar (`current`), los que no cambian no se vuelven a validar y el agente conserva su sucursal.
 * El contract ya garantizó que cada monto va con su moneda.
 */
export async function buildTerms(
  producers: Producers,
  agentUserId: string,
  input: TermsInput,
  current?: ReservationTerms,
): Promise<Result<ReservationTerms, AgentNotFoundError | ManagerNotFoundError>> {
  let branchId = current?.branchId;
  if (current?.agentUserId !== agentUserId) {
    const agent = await producers.find(agentUserId);
    if (!agent) return err({ type: 'AgentNotFound' });
    branchId = agent.branchId;
  }
  const manager = input.managerUserId;
  if (manager !== undefined && manager !== current?.managerUserId) {
    if (!(await producers.find(manager))) return err({ type: 'ManagerNotFound' });
  }
  return ok({
    agentUserId,
    branchId,
    managerUserId: manager,
    amount: money(input.amount, input.currency),
    commissionPct: input.commissionPct,
    commission: money(input.commissionAmount, input.commissionCurrency),
    estimatedSigningDate: input.estimatedSigningDate,
    notes: input.notes,
  });
}

/** Valores crudos de la reserva para el historial de la propiedad. Usuarios y cliente, por ID. */
export function reservationAuditState(reservation: Reservation): AuditState {
  const s = reservation.toSnapshot();
  return {
    reservationId: s.id,
    clientId: s.clientId,
    opportunityId: s.opportunityId,
    reservationOperation: s.operation,
    reservationStatus: s.status,
    agentUserId: s.agentUserId,
    managerUserId: s.managerUserId,
    reservationBranchId: s.branchId,
    amountCents: s.amount?.cents,
    amountCurrency: s.amount?.currency,
    commissionPct: s.commissionPct,
    commissionCents: s.commission?.cents,
    commissionCurrency: s.commission?.currency,
    estimatedSigningDate: s.estimatedSigningDate,
    reservationNotes: s.notes,
    fallenReason: s.fallenReason,
  };
}

/**
 * Las reservas se registran en el historial de su propiedad (la entidad principal), con el cliente
 * en `clientIds` para poder suprimirlas. Si el cliente cambió, van los dos (`previousClientId`):
 * la entrada tiene los datos de ambos.
 */
export function reservationTarget(
  action: string,
  reservation: Reservation,
  previousClientId?: string,
): AuditTarget {
  const clientIds = [...new Set([previousClientId, reservation.clientId])].filter(
    (id): id is string => id !== undefined,
  );
  return { action, entityType: 'property', entityId: reservation.propertyId, clientIds };
}

/** El contacto no existe, está en la papelera, se unificó o el que reserva no lo puede ver. */
export interface ReservationClientNotFoundError {
  readonly type: 'ReservationClientNotFound';
}

/** Que el contacto exista (sin papelera ni unificación) y el actor lo pueda ver. */
export async function checkReservationClient(
  parties: ReservationParties,
  actor: Actor,
  clientId: string,
): Promise<Result<void, ReservationClientNotFoundError>> {
  const client = await parties.client(clientId);
  if (!client || !canActOn(actor, OWNERSHIP_RULES.clientsRead, client)) {
    return err({ type: 'ReservationClientNotFound' });
  }
  return ok(undefined);
}

export async function findReservation(
  reservations: ReservationRepository,
  rawId: string,
): Promise<Reservation | undefined> {
  const id = parseId<'Reservation'>(rawId);
  return id.isOk() ? reservations.findById(id.value) : undefined;
}

/** La reserva con su propiedad, para caerla, firmarla o editarla (`reservations:update`). */
export async function loadReservationForChange(
  tx: PropertiesTransaction,
  actor: Actor,
  reservationId: string,
): Promise<
  Result<
    { readonly reservation: Reservation; readonly property: Property },
    ForbiddenError | ReservationNotFoundError | PropertyNotFoundError
  >
> {
  if (!actor.can('reservations:update')) return err({ type: 'Forbidden' });
  const reservation = await findReservation(tx.reservations, reservationId);
  if (!reservation) return err({ type: 'ReservationNotFound' });
  const property = await findProperty(tx.properties, reservation.propertyId);
  if (!property) return err({ type: 'PropertyNotFound' });
  return ok({ reservation, property });
}
