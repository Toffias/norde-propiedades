import {
  PRICE_CURRENCIES,
  PROPERTY_OPERATIONS,
  RESERVATION_STATUSES,
  type PropertyReservationsQuery,
  type ReservationListItem,
} from '@norde/core/properties';
import type { MoneyDto } from '@norde/core/properties/contracts';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clients, reservations } from '../db/schema';

const OperationSchema = z.enum(PROPERTY_OPERATIONS);
const StatusSchema = z.enum(RESERVATION_STATUSES);
const CurrencySchema = z.enum(PRICE_CURRENCIES);

function money(cents: bigint | null, currency: string | null): MoneyDto | undefined {
  return cents === null || currency === null
    ? undefined
    : { amountCents: cents, currency: CurrencySchema.parse(currency) };
}

const SORT_COLUMNS = {
  reservedAt: reservations.reservedAt,
  estimatedSigningDate: reservations.estimatedSigningDate,
} as const;

/** Las reservas de una propiedad (`reservations_property_reserved_idx`), con el nombre del cliente. */
export class DrizzlePropertyReservationsQuery implements PropertyReservationsQuery {
  constructor(private readonly db: DbExecutor) {}

  async listByProperty(query: {
    readonly propertyId: string;
    readonly sort: {
      readonly field: keyof typeof SORT_COLUMNS;
      readonly direction: 'asc' | 'desc';
    };
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ReservationListItem>> {
    const order = query.sort.direction === 'asc' ? asc : desc;
    const where = eq(reservations.propertyId, query.propertyId);
    const [rows, [total]] = await Promise.all([
      this.#select()
        .where(where)
        .orderBy(sql`${order(SORT_COLUMNS[query.sort.field])} nulls last`, order(reservations.id))
        .offset(query.offset)
        .limit(query.limit),
      this.db.select({ value: count() }).from(reservations).where(where),
    ]);
    return { items: rows.map(toItem), total: total?.value ?? 0 };
  }

  async findActive(propertyId: string): Promise<ReservationListItem | undefined> {
    const [row] = await this.#select()
      .where(and(eq(reservations.propertyId, propertyId), eq(reservations.status, 'active')))
      .limit(1);
    return row && toItem(row);
  }

  /** Un contacto en la papelera o suprimido no muestra su nombre. */
  #select() {
    return this.db
      .select({
        reservation: reservations,
        clientName: sql<
          string | null
        >`coalesce(${clients.name}, ${clients.companyName}, 'Sin nombre')`,
        clientFound: sql<boolean>`${clients.id} is not null`,
      })
      .from(reservations)
      .leftJoin(clients, and(eq(clients.id, reservations.clientId), isNull(clients.deletedAt)));
  }
}

function toItem(row: {
  readonly reservation: typeof reservations.$inferSelect;
  readonly clientName: string | null;
  readonly clientFound: boolean;
}): ReservationListItem {
  const r = row.reservation;
  return {
    id: r.id,
    propertyId: r.propertyId,
    client: { id: r.clientId, name: row.clientFound ? (row.clientName ?? undefined) : undefined },
    opportunityId: r.opportunityId ?? undefined,
    agentUserId: r.agentUserId ?? undefined,
    managerUserId: r.managerUserId ?? undefined,
    operation: OperationSchema.parse(r.operation),
    amount: money(r.amountCents, r.currency),
    commissionPct: r.commissionPct ?? undefined,
    commission: money(r.commissionCents, r.commissionCurrency),
    status: StatusSchema.parse(r.status),
    reservedAt: r.reservedAt,
    estimatedSigningDate: r.estimatedSigningDate ?? undefined,
    fallenAt: r.fallenAt ?? undefined,
    fallenReason: r.fallenReason ?? undefined,
    signedAt: r.signedAt ?? undefined,
    notes: r.notes ?? undefined,
  };
}
