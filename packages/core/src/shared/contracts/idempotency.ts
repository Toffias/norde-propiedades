import { z } from 'zod';

/**
 * Clave de idempotencia de un alta (ADR 0050). El formulario la genera al abrirse y la manda igual
 * en cada reintento.
 */
export const idempotencyKeySchema = z.uuid();
