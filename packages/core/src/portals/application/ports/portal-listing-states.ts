import type { Result } from '../../../shared';
import type { RemoteListingState } from '../../domain/listing';
import type { PortalId } from '../../domain/portal';
import type { PortalUnavailableError } from './portal-authorizer';
import type { PortalCredentialsMissingError } from './portal-connector';

/**
 * Lee cómo están los avisos en el portal (activos, pausados por moderación, vencidos), para la
 * conciliación diaria. El motivo de una pausa o un cierre viene en español, listo para mostrar.
 */
export interface PortalListingStateReader {
  /**
   * El estado de esos avisos, por su ID en el portal. Uno que el portal no informa (o informa en un
   * estado transitorio, como "procesando las fotos") no está en el mapa: queda como estaba.
   */
  states(
    portal: PortalId,
    externalIds: readonly string[],
  ): Promise<
    Result<
      ReadonlyMap<string, RemoteListingState>,
      PortalUnavailableError | PortalCredentialsMissingError
    >
  >;
}
