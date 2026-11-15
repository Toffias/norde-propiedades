import { z } from 'zod';

/**
 * Lo que recibe la reacción de cada módulo a `identity.user_branch_changed` (#221): el usuario y
 * las sucursales de antes y de ahora, para mover lo suyo que todavía está en la de antes.
 */
export const UserBranchChangeInputSchema = z
  .object({ userId: z.uuid(), fromBranchId: z.uuid(), toBranchId: z.uuid() })
  .refine((input) => input.fromBranchId !== input.toBranchId, {
    message: 'La sucursal nueva es la misma.',
    path: ['toBranchId'],
  });

export type UserBranchChangeInput = z.input<typeof UserBranchChangeInputSchema>;

/** Filas por transacción al mover los registros de un usuario a su sucursal nueva. */
export const USER_BRANCH_CHANGE_BATCH_SIZE = 200;
