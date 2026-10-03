import type { Actor, Result } from '../../../shared';
import type { ReferenceCodeUnavailableError } from './reference-code-allocator';

/**
 * Entrega el código de referencia de un emprendimiento nuevo (la numeración vive en Mi empresa).
 * Corre en su propia transacción: si el alta falla después, ese número queda sin usar.
 */
export interface DevelopmentCodeAllocator {
  allocate(
    request: {
      readonly producerUserId: string | undefined;
      readonly branchId: string | undefined;
    },
    actor: Actor,
  ): Promise<Result<string, ReferenceCodeUnavailableError>>;
}
