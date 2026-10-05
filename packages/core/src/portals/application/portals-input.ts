import type { z } from 'zod';

import { err, ok, type Result } from '../../shared';

/** Los datos no cumplen el contract. `issues` lleva los mensajes de Zod. */
export interface ValidationFailedError {
  readonly type: 'ValidationFailed';
  readonly issues: readonly string[];
}

/** Valida el input de un caso de uso con su contract. */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): Result<z.output<TSchema>, ValidationFailedError> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err({ type: 'ValidationFailed', issues: parsed.error.issues.map((i) => i.message) });
  }
  return ok(parsed.data);
}
