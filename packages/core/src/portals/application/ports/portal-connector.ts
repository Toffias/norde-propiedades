import type { Result } from '../../../shared';
import type { ListingOperation, ListingType } from '../../domain/listing';
import type { ListingOwnerKind, PortalId } from '../../domain/portal';
import type { DevelopmentListingSource } from './development-listing-source';
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

/** Lo que se manda al portal de una propiedad: la operación que se publica y el tipo de aviso. */
export interface PropertyListingContent {
  readonly kind: 'property';
  /** La publicación: los portales donde Norde elige el código del aviso (Zonaprop) lo usan. */
  readonly listingId: string;
  readonly source: ListingSource;
  /** Sin operación: el aviso lleva todas las operaciones con precio (Zonaprop). */
  readonly operation: ListingOperation | undefined;
  readonly listingType: ListingType;
  /** El plan del portal, si el portal lo pide (Zonaprop). */
  readonly plan: string | undefined;
}

/** Lo que se manda al portal de un emprendimiento: un aviso con todas sus unidades publicables. */
export interface DevelopmentListingContent {
  readonly kind: 'development';
  readonly listingId: string;
  readonly source: DevelopmentListingSource;
  readonly listingType: ListingType;
  readonly plan: string | undefined;
}

export type PortalListingContent = PropertyListingContent | DevelopmentListingContent;

/** Estado del aviso en el portal después de un cambio. */
export type PortalListingState = 'active' | 'paused' | 'closed';

/** Cómo quedó el aviso, y su link si el portal lo informa (Zonaprop lo da al mandar el aviso). */
export interface PortalListingUpdate {
  readonly state: PortalListingState;
  readonly permalink: string | undefined;
}

/**
 * Conector de un portal. Traduce la publicación a su API: el core decide qué hacer (crear,
 * actualizar, pausar, cerrar) y el conector cómo.
 */
export interface PortalConnector {
  /**
   * Lo que le falta a la propiedad o al emprendimiento para este portal ("Falta la superficie
   * cubierta"), sin llamarlo. Vacío: se puede publicar.
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
  ): Promise<Result<PortalListingUpdate, PortalSyncError>>;
  /** Lo da de baja. `kind` dice si es el aviso de una propiedad o el de un emprendimiento. */
  close(
    portal: PortalId,
    externalId: string,
    kind: ListingOwnerKind,
  ): Promise<Result<void, PortalSyncError>>;
}
