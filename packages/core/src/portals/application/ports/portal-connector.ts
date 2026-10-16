import type { Result } from '../../../shared';
import type { ListingOperation, ListingType } from '../../domain/listing';
import type { PortalId } from '../../domain/portal';
import type { PortalUnavailableError } from './portal-authorizer';
import type { ListingSource } from './listing-source';

/** El portal rechazó el aviso: el motivo, en español, para mostrar en la publicación. */
export interface PortalRejectedError {
  readonly type: 'PortalRejected';
  readonly reason: string;
}

/** La cuenta no tiene credenciales o el portal las revocó: hay que volver a conectarla. */
export interface PortalCredentialsMissingError {
  readonly type: 'PortalCredentialsMissing';
}

export type PortalSyncError =
  PortalRejectedError | PortalUnavailableError | PortalCredentialsMissingError;

/** Lo que se manda al portal: la propiedad, la operación que se publica y el tipo de aviso. */
export interface PortalListingContent {
  /** La publicación: los portales donde Norde elige el código del aviso (Zonaprop) lo usan. */
  readonly listingId: string;
  readonly source: ListingSource;
  /** Sin operación: el aviso lleva todas las operaciones con precio (Zonaprop). */
  readonly operation: ListingOperation | undefined;
  readonly listingType: ListingType;
  /** El plan del portal, si el portal lo pide (Zonaprop). */
  readonly plan: string | undefined;
}

/** Estado del aviso en el portal después de un cambio. */
export type PortalListingState = 'active' | 'paused' | 'closed';

/**
 * Conector de un portal. Traduce la publicación a su API: el core decide qué hacer (crear,
 * actualizar, pausar, cerrar) y el conector cómo.
 */
export interface PortalConnector {
  /**
   * Lo que le falta a la propiedad para este portal ("Falta la superficie cubierta"), sin
   * llamarlo. Vacío: se puede publicar.
   */
  problems(portal: PortalId, content: PortalListingContent): readonly string[];
  create(
    portal: PortalId,
    content: PortalListingContent,
  ): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  >;
  /**
   * Lleva el aviso al estado pedido. `contentChanged` dice si hay que mandar el contenido; el
   * contenido va siempre, porque hay portales que lo piden para volver a ponerlo online (Zonaprop
   * no pausa: lo saca y lo vuelve a publicar). Si el portal ya lo había cerrado (vencido, dado de
   * baja allá), devuelve `closed`.
   */
  update(
    portal: PortalId,
    externalId: string,
    change: {
      readonly content: PortalListingContent;
      readonly contentChanged: boolean;
      readonly state: 'active' | 'paused';
    },
  ): Promise<Result<PortalListingState, PortalSyncError>>;
  close(portal: PortalId, externalId: string): Promise<Result<void, PortalSyncError>>;
}
