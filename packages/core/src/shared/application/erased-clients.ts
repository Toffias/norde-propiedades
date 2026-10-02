import { z } from 'zod';

/** El contacto suprimido más los duplicados que se le habían unificado (como mucho 100). */
export const MAX_ERASED_CLIENT_IDS = 101;

/**
 * Lo que recibe la reacción de cada módulo a `clients.client_erased`: los IDs de los clientes
 * suprimidos, para borrar o desvincular lo suyo.
 */
export const ErasedClientsInputSchema = z.object({
  clientIds: z.array(z.uuid()).min(1).max(MAX_ERASED_CLIENT_IDS),
});

export type ErasedClientsInput = z.input<typeof ErasedClientsInputSchema>;
