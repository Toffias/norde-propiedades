import type { Actor, Result } from '../../../shared';
import type { PropertyKind } from '../../domain/property-catalog';

export interface ReferenceCodeUnavailableError {
  readonly type: 'ReferenceCodeUnavailable';
}

/**
 * Entrega el código de referencia de una propiedad nueva (la numeración vive en Mi empresa). Corre
 * en su propia transacción: si el alta falla después, ese número queda sin usar.
 */
export interface ReferenceCodeAllocator {
  allocate(
    request: {
      readonly kind: PropertyKind;
      readonly producerUserId: string | undefined;
      readonly branchId: string | undefined;
    },
    actor: Actor,
  ): Promise<Result<string, ReferenceCodeUnavailableError>>;
}
