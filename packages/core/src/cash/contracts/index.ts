// Contracts del módulo cash (`@norde/core/cash/contracts`): importables desde el cliente.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

/** Replica `CASH_BOXES` del dominio. */
export const CASH_BOX_VALUES = ['office', 'osvaldo'] as const;
export type CashBoxValue = (typeof CASH_BOX_VALUES)[number];

export const CASH_BOX_LABELS: Readonly<Record<CashBoxValue, string>> = {
  office: 'Caja de oficina',
  osvaldo: 'Caja Osvaldo',
};

/** Replica `CASH_MOVEMENT_KINDS` del dominio. */
export const CASH_MOVEMENT_KIND_VALUES = ['income', 'expense'] as const;
export type CashMovementKindValue = (typeof CASH_MOVEMENT_KIND_VALUES)[number];

export const CASH_MOVEMENT_KIND_LABELS: Readonly<Record<CashMovementKindValue, string>> = {
  income: 'Ingreso',
  expense: 'Egreso',
};

/**
 * "125000", "125.000", "125.000,50", "$ 125.000" o "1500.5" → centavos, sin pasar por `number`.
 * Con coma, el punto es separador de miles; sin coma, solo si agrupa de a tres. `undefined` si
 * no es un monto.
 */
export function parseCashAmount(text: string): bigint | undefined {
  let value = text.replace(/[$\s]/g, '');
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value);
  if (match === null) return undefined;
  const [, units = '0', fraction = ''] = match;
  return BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Monto como lo escribe el usuario, o los centavos ya parseados. Mayor a cero. */
export const CashAmountSchema = z
  .union([
    z.string().transform((text, ctx) => {
      const cents = parseCashAmount(text);
      if (cents === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Ingresá un monto, por ejemplo 125.000.' });
        return z.NEVER;
      }
      return cents;
    }),
    z.bigint(),
  ])
  .refine((cents) => cents > 0n, 'Ingresá un monto mayor a cero.');

const DateSchema = z.iso.date('La fecha no es válida.');
const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes no es válido.');

const MovementValues = {
  date: DateSchema,
  kind: z.enum(CASH_MOVEMENT_KIND_VALUES, 'Elegí si es un ingreso o un egreso.'),
  amount: CashAmountSchema,
  concept: z
    .string()
    .trim()
    .min(1, 'Escribí el concepto.')
    .max(255, 'El concepto es demasiado largo (máximo 255 caracteres).'),
  notes: z
    .string()
    .trim()
    .max(500, 'Las observaciones son demasiado largas (máximo 500 caracteres).')
    .optional()
    .transform((notes) => (notes === '' ? undefined : notes)),
};

export const RecordCashMovementInputSchema = z.object({
  box: z.enum(CASH_BOX_VALUES),
  ...MovementValues,
});
export type RecordCashMovementInput = z.input<typeof RecordCashMovementInputSchema>;

export const UpdateCashMovementInputSchema = z.object({
  movementId: z.uuid(),
  ...MovementValues,
});
export type UpdateCashMovementInput = z.input<typeof UpdateCashMovementInputSchema>;

export const CashMovementIdInputSchema = z.object({ movementId: z.uuid() });
export type CashMovementIdInput = z.input<typeof CashMovementIdInputSchema>;

/** Un mes de una caja. Sin mes, el vigente. */
export const CashPeriodQuerySchema = z.object({
  box: z.enum(CASH_BOX_VALUES),
  period: PeriodSchema.optional(),
});
export type CashPeriodQuery = z.input<typeof CashPeriodQuerySchema>;

/** Los movimientos activos de un mes de una caja, por fecha de carga. */
export const ListCashMovementsQuerySchema = pageQuerySchema({
  sortable: ['date'],
  defaultSort: { field: 'date', direction: 'asc' },
}).extend(CashPeriodQuerySchema.shape);
export type ListCashMovementsQuery = z.input<typeof ListCashMovementsQuerySchema>;

/** Los meses que se pueden consultar de una caja: los cerrados y el vigente. */
export const ListCashPeriodsQuerySchema = pageQuerySchema({
  sortable: ['period'],
  defaultSort: { field: 'period', direction: 'desc' },
}).extend({ box: z.enum(CASH_BOX_VALUES) });
export type ListCashPeriodsQuery = z.input<typeof ListCashPeriodsQuerySchema>;

/** Un movimiento de la planilla, con el saldo de la caja después de él. */
export interface CashMovementRow {
  readonly id: string;
  readonly date: string;
  readonly kind: CashMovementKindValue;
  readonly amountCents: bigint;
  readonly concept: string;
  readonly notes: string | undefined;
  readonly balanceCents: bigint;
  readonly createdAt: Date;
  readonly createdBy: string;
  /** Nombre de quien lo cargó; `undefined` si el usuario ya no está activo. */
  readonly createdByName: string | undefined;
}

/** Encabezado del mes: saldos, cierre y qué puede hacer el usuario. */
export interface CashPeriodSummary {
  readonly box: CashBoxValue;
  readonly period: string;
  readonly currentPeriod: string;
  readonly openingCents: bigint;
  readonly incomeCents: bigint;
  readonly expenseCents: bigint;
  readonly closingCents: bigint;
  /** Cuándo se cerró; `undefined` en el mes vigente o si todavía no se cerró. */
  readonly closedAt: Date | undefined;
  /** El único movimiento que se puede anular. */
  readonly lastMovementId: string | undefined;
  readonly can: {
    readonly create: boolean;
    readonly update: boolean;
    readonly void: boolean;
    readonly delete: boolean;
  };
}

export interface CashPeriodRow {
  readonly period: string;
  readonly closingCents: bigint | undefined;
  readonly isCurrent: boolean;
}
