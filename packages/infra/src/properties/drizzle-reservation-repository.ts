import {
  PRICE_CURRENCIES,
  PROPERTY_OPERATIONS,
  RESERVATION_STATUSES,
  Reservation,
  type PropertyId,
  type ReservationAmount,
  type ReservationId,
  type ReservationRepository,
  type ReservationSnapshot,
} from '@norde/core/properties';
import { parseId } from '@norde/core/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { reservations } from '../db/schema';

type ReservationDbRow = typeof reservations.$inferSelect;

const CurrencySchema = z.enum(PRICE_CURRENCIES);

function reservationMoney(
  cents: bigint | null,
  currency: string | null,
): ReservationAmount | undefined {
  return cents === null || currency === null
    ? undefined
    : { cents, currency: CurrencySchema.parse(currency) };
}

function toSnapshot(row: ReservationDbRow): ReservationSnapshot {
  const id = parseId<'Reservation'>(row.id);
  const propertyId = parseId<'Property'>(row.propertyId);
  if (id.isErr() || propertyId.isErr()) throw new Error(`Invalid reservation ${row.id}`);
  return {
    id: id.value,
    propertyId: propertyId.value,
    clientId: row.clientId,
    opportunityId: row.opportunityId ?? undefined,
    operation: z.enum(PROPERTY_OPERATIONS).parse(row.operation),
    status: z.enum(RESERVATION_STATUSES).parse(row.status),
    agentUserId: row.agentUserId ?? undefined,
    branchId: row.branchId ?? undefined,
    managerUserId: row.managerUserId ?? undefined,
    amount: reservationMoney(row.amountCents, row.currency),
    commissionPct: row.commissionPct ?? undefined,
    commission: reservationMoney(row.commissionCents, row.commissionCurrency),
    estimatedSigningDate: row.estimatedSigningDate ?? undefined,
    notes: row.notes ?? undefined,
    reservedAt: row.reservedAt,
    fallenAt: row.fallenAt ?? undefined,
    fallenReason: row.fallenReason ?? undefined,
    signedAt: row.signedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Lo que cambia de una reserva: todo menos la propiedad, el cliente, la operación y el alta. */
function changingValues(s: ReservationSnapshot, actorId: string) {
  return {
    status: s.status,
    agentUserId: s.agentUserId ?? null,
    branchId: s.branchId ?? null,
    managerUserId: s.managerUserId ?? null,
    amountCents: s.amount?.cents ?? null,
    currency: s.amount?.currency ?? null,
    commissionPct: s.commissionPct ?? null,
    commissionCents: s.commission?.cents ?? null,
    commissionCurrency: s.commission?.currency ?? null,
    estimatedSigningDate: s.estimatedSigningDate ?? null,
    notes: s.notes ?? null,
    fallenAt: s.fallenAt ?? null,
    fallenReason: s.fallenReason ?? null,
    signedAt: s.signedAt ?? null,
    updatedAt: s.updatedAt,
    updatedBy: actorId,
  };
}

export class DrizzleReservationRepository implements ReservationRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: ReservationId): Promise<Reservation | undefined> {
    const [row] = await this.db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    return row && Reservation.restore(toSnapshot(row));
  }

  async findActiveByProperty(propertyId: PropertyId): Promise<Reservation | undefined> {
    const [row] = await this.db
      .select()
      .from(reservations)
      .where(and(eq(reservations.propertyId, propertyId), eq(reservations.status, 'active')))
      .limit(1);
    return row && Reservation.restore(toSnapshot(row));
  }

  /**
   * El índice único parcial `reservations_active_property_uq` rechaza una segunda reserva activa de
   * la misma propiedad: si otra transacción la tomó primero, esta espera a que termine y no inserta.
   */
  async insert(reservation: Reservation, actorId: string): Promise<boolean> {
    const s = reservation.toSnapshot();
    const inserted = await this.db
      .insert(reservations)
      .values({
        id: s.id,
        propertyId: s.propertyId,
        clientId: s.clientId,
        opportunityId: s.opportunityId ?? null,
        operation: s.operation,
        reservedAt: s.reservedAt,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...changingValues(s, actorId),
      })
      .onConflictDoNothing()
      .returning({ id: reservations.id });
    return inserted.length > 0;
  }

  async save(reservation: Reservation, actorId: string): Promise<void> {
    const s = reservation.toSnapshot();
    await this.db
      .update(reservations)
      .set(changingValues(s, actorId))
      .where(eq(reservations.id, s.id));
  }

  async findActiveByClients(
    clientIds: readonly string[],
    limit: number,
  ): Promise<readonly Reservation[]> {
    if (clientIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(reservations)
      .where(and(inArray(reservations.clientId, [...clientIds]), eq(reservations.status, 'active')))
      .orderBy(reservations.id)
      .limit(limit);
    return rows.map((row) => Reservation.restore(toSnapshot(row)));
  }

  async remove(reservation: Reservation): Promise<void> {
    await this.db.delete(reservations).where(eq(reservations.id, reservation.id));
  }

  async deleteByClients(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const deleted = await this.db
      .delete(reservations)
      .where(inArray(reservations.clientId, [...clientIds]))
      .returning({ id: reservations.id });
    return deleted.length;
  }
}
