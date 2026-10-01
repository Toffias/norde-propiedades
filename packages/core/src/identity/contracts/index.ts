// Contracts del módulo identity (`@norde/core/identity/contracts`): importables desde el cliente.

import { z } from 'zod';

export const SignInInputSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

export type SignInInput = z.input<typeof SignInInputSchema>;

export interface RoleSummary {
  readonly key: string;
  readonly name: string;
}

/** Quién está usando el panel: lo que muestra el menú de la cuenta. */
export interface SessionProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly RoleSummary[];
}
