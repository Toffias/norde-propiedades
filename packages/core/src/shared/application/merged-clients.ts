import { z } from 'zod';

/**
 * Lo que recibe la reacción de cada módulo a `clients.clients_merged`: el contacto que queda y el
 * duplicado que se le unificó, para pasar al primero lo que apuntaba al segundo.
 */
export const MergedClientInputSchema = z
  .object({ clientId: z.uuid(), mergedClientId: z.uuid() })
  .refine((input) => input.clientId !== input.mergedClientId, {
    message: 'Un contacto no se unifica consigo mismo.',
    path: ['mergedClientId'],
  });

export type MergedClientInput = z.input<typeof MergedClientInputSchema>;
