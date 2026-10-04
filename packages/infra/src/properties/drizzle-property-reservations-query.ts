import {
  PRICE_CURRENCIES,
  PROPERTY_OPERATIONS,
  RESERVATION_STATUSES,
  type PropertyReservationsQuery,
  type ReservationFilterCriteria,
  type ReservationListItem,
  type ReservationListQuery,
  type ReservationSearchItem,
} from '@norde/core/properties';
import {
  PROPERTY_TYPES,
  type MoneyDto,
  type ReservationSortField,
} from '@norde/core/properties/contracts';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, gte, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clients, properties, reservations } from '../db/schema';

const OperationSchema = z.enum(PROPERTY_OPERATIONS);
const StatusSchema = z.enum(RESERVATION_STATUSES);
const CurrencySchema = z.enum(PRICE_CURRENCIES);
const PropertyTypeSchema = z.enum(PROPERTY_TYPES);

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

const LIST_SORT_COLUMNS: Readonly<
  Record<
    ReservationSortField,
    typeof reservations.reservedAt | typeof reservations.estimatedSigningDate
  >
> = {
  reservedAt: reservations.reservedAt,
  estimatedSigningDate: reservations.estimatedSigningDate,
};

/** Las condiciones de los filtros: cada una tiene su índice (ver el esquema de `reservations`). */
function conditions(criteria: ReservationFilterCriteria): SQL | undefined {
  const parts: (SQL | undefined)[] = [
    criteria.status === undefined ? undefined : eq(reservations.status, criteria.status),
    criteria.operation === undefined ? undefined : eq(reservations.operation, criteria.operation),
    criteria.propertyType === undefined
      ? undefined
      : eq(properties.propertyType, criteria.propertyType),
    criteria.agentUserId === undefined
      ? undefined
      : eq(reservations.agentUserId, criteria.agentUserId),
    criteria.managerUserId === undefined
      ? undefined
      : eq(reservations.managerUserId, criteria.managerUserId),
    criteria.branchId === undefined ? undefined : eq(reservations.branchId, criteria.branchId),
    criteria.reserved.from === undefined
      ? undefined
      : gte(reservations.reservedAt, criteria.reserved.from),
    criteria.reserved.to === undefined
      ? undefined
      : lt(reservations.reservedAt, criteria.reserved.to),
    criteria.signing.from === undefined
      ? undefined
      : gte(reservations.estimatedSigningDate, criteria.signing.from),
    criteria.signing.to === undefined
      ? undefined
      : lte(reservations.estimatedSigningDate, criteria.signing.to),
  ];
  return and(...parts);
}

/**
 * Todas las reservas (`/reservas`), con la propiedad y el nombre del cliente. Incluye las de
 * propiedades en la papelera: la reserva es historia comercial.
 */
export class DrizzleReservationListQuery implements ReservationListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(
    query: ReservationFilterCriteria & {
      readonly sort: { readonly field: ReservationSortField; readonly direction: 'asc' | 'desc' };
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<ReservationSearchItem>> {
    const order = query.sort.direction === 'asc' ? asc : desc;
    const [rows, total] = await Promise.all([
      this.db
        .select({
          reservation: reservations,
          clientName: sql<
            string | null
          >`coalesce(${clients.name}, ${clients.companyName}, 'Sin nombre')`,
          clientFound: sql<boolean>`${clients.id} is not null`,
          propertyCode: properties.code,
          propertyType: properties.propertyType,
          propertyAddress: sql<string>`coalesce(nullif(${properties.publishAddress}, ''), ${properties.title})`,
        })
        .from(reservations)
        .innerJoin(properties, eq(properties.id, reservations.propertyId))
        .leftJoin(clients, and(eq(clients.id, reservations.clientId), isNull(clients.deletedAt)))
        .where(conditions(query))
        .orderBy(
          sql`${order(LIST_SORT_COLUMNS[query.sort.field])} nulls last`,
          order(reservations.id),
        )
        .offset(query.offset)
        .limit(query.limit),
      this.count(query),
    ]);
    return {
      items: rows.map((row) => ({
        ...toItem(row),
        property: {
          id: row.reservation.propertyId,
          code: row.propertyCode,
          propertyType: PropertyTypeSchema.parse(row.propertyType),
          address: row.propertyAddress,
        },
      })),
      total,
    };
  }

  async count(criteria: ReservationFilterCriteria): Promise<number> {
    const base = this.db.select({ value: count() }).from(reservations);
    // La propiedad solo hace falta para filtrar por su tipo.
    const [row] = await (criteria.propertyType === undefined
      ? base.where(conditions(criteria))
      : base
          .innerJoin(properties, eq(properties.id, reservations.propertyId))
          .where(conditions(criteria)));
    return row?.value ?? 0;
  }
}
