// Contracts de las reservas de una propiedad (#13).

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import { AmountSchema } from './amount';
import { PercentageSchema, type PanelUserRef } from './detail';
import type { MoneyDto } from './index';
import { CURRENCIES, OPERATIONS, type Currency, type Operation } from './values';

/** Replica `RESERVATION_STATUSES` del dominio. */
export const RESERVATION_STATUS_VALUES = ['active', 'fallen', 'signed'] as const;
export type ReservationStatusValue = (typeof RESERVATION_STATUS_VALUES)[number];

export const MAX_RESERVATION_NOTES_LENGTH = 2000;
export const MAX_FALLEN_REASON_LENGTH = 500;

/**
 * Lo que se carga y se edita de una reserva. El valor y la comisión en monto van con su moneda; la
 * comisión puede ser porcentaje, monto o ambos (los dos opcionales).
 */
const reservationTerms = {
  /** Sin agente: queda quien reserva. */
  agentUserId: z.uuid().optional(),
  managerUserId: z.uuid().optional(),
  /** En unidades; vacío: sin valor cargado. */
  amount: AmountSchema.optional(),
  currency: z.enum(CURRENCIES).optional(),
  commissionPct: PercentageSchema.optional(),
  commissionAmount: AmountSchema.optional(),
  commissionCurrency: z.enum(CURRENCIES).optional(),
  /** Fecha estimada de firma (`AAAA-MM-DD`). */
  estimatedSigningDate: z.iso.date('Ingresá una fecha válida.').optional(),
  notes: z.string().trim().max(MAX_RESERVATION_NOTES_LENGTH).optional(),
};

interface TermsWithCurrencies {
  readonly amount?: bigint | undefined;
  readonly currency?: Currency | undefined;
  readonly commissionAmount?: bigint | undefined;
  readonly commissionCurrency?: Currency | undefined;
}

/** Un monto sin moneda no se puede guardar. */
function withCurrencies<T extends z.ZodType<TermsWithCurrencies>>(schema: T) {
  return schema
    .refine((terms) => terms.amount === undefined || terms.currency !== undefined, {
      message: 'Elegí la moneda del valor.',
      path: ['currency'],
    })
    .refine(
      (terms) => terms.commissionAmount === undefined || terms.commissionCurrency !== undefined,
      { message: 'Elegí la moneda de la comisión.', path: ['commissionCurrency'] },
    );
}

export const ReservePropertyInputSchema = withCurrencies(
  z.object({
    propertyId: z.uuid(),
    clientId: z.uuid('Elegí un contacto.'),
    /** Si se reserva desde una destacada: la oportunidad a la que está atada. */
    opportunityId: z.uuid().optional(),
    operation: z.enum(OPERATIONS),
    ...reservationTerms,
  }),
);
export type ReservePropertyInput = z.input<typeof ReservePropertyInputSchema>;

export const UpdateReservationInputSchema = withCurrencies(
  z.object({ reservationId: z.uuid(), ...reservationTerms }),
);
export type UpdateReservationInput = z.input<typeof UpdateReservationInputSchema>;

export const FallReservationInputSchema = z.object({
  reservationId: z.uuid(),
  reason: z.string().trim().max(MAX_FALLEN_REASON_LENGTH).optional(),
});
export type FallReservationInput = z.input<typeof FallReservationInputSchema>;

export const SignReservationInputSchema = z.object({ reservationId: z.uuid() });
export type SignReservationInput = z.input<typeof SignReservationInputSchema>;

export const PROPERTY_RESERVATION_SORT_FIELDS = ['reservedAt', 'estimatedSigningDate'] as const;
export type PropertyReservationSortField = (typeof PROPERTY_RESERVATION_SORT_FIELDS)[number];

/** Las reservas de una propiedad (pestaña Reservas de la ficha): activas, caídas y firmadas. */
export const ListPropertyReservationsQuerySchema = pageQuerySchema({
  sortable: PROPERTY_RESERVATION_SORT_FIELDS,
  defaultSort: { field: 'reservedAt', direction: 'desc' },
}).extend({ propertyId: z.uuid() });
export type ListPropertyReservationsQuery = z.input<typeof ListPropertyReservationsQuerySchema>;

export const ActiveReservationQuerySchema = z.object({ propertyId: z.uuid() });
export type ActiveReservationQuery = z.input<typeof ActiveReservationQuerySchema>;

/** Una reserva, para la ficha de la propiedad. Los nombres se resuelven al leer. */
export interface ReservationRow {
  readonly id: string;
  readonly propertyId: string;
  /** `name` es `undefined` si el contacto ya no está (papelera o supresión). */
  readonly client: { readonly id: string; readonly name: string | undefined };
  readonly opportunityId: string | undefined;
  readonly agent: PanelUserRef | undefined;
  readonly manager: PanelUserRef | undefined;
  readonly operation: Operation;
  readonly amount: MoneyDto | undefined;
  readonly commissionPct: number | undefined;
  readonly commission: MoneyDto | undefined;
  readonly status: ReservationStatusValue;
  readonly reservedAt: Date;
  readonly estimatedSigningDate: string | undefined;
  readonly fallenAt: Date | undefined;
  readonly fallenReason: string | undefined;
  readonly signedAt: Date | undefined;
  readonly notes: string | undefined;
}
