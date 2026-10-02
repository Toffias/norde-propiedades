import { z } from 'zod';

/** Lo que hay que escribir para confirmar la supresión de un contacto sin nombre. */
export const ERASURE_CONFIRMATION_WORD = 'suprimir';

export const EraseClientDataInputSchema = z.object({
  clientId: z.uuid(),
  /** Segunda confirmación: el nombre del contacto, o `suprimir` si no tiene. */
  confirmation: z.string().trim().min(1).max(200),
  /** Cuándo lo pidió el cliente (`AAAA-MM-DD`): queda en la constancia. */
  requestedOn: z.iso.date(),
});

export type EraseClientDataInput = z.input<typeof EraseClientDataInputSchema>;

export interface EraseClientDataOutput {
  /** El contacto y los duplicados que se le habían unificado. */
  readonly erasedClientIds: readonly string[];
}
