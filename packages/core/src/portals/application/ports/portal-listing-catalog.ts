import type { PageSlice, Result } from '../../../shared';
import type { PortalId } from '../../domain/portal';
import type { PortalSyncError } from './portal-connector';
import type { PortalNotConfiguredError, PortalUnavailableError } from './portal-authorizer';

/** Un aviso que está online en el portal, publicado por Norde o por otro sistema (Tokko). */
export interface RemoteListing {
  /** El ID del aviso en el portal (en Zonaprop, `idAvisoNavplat`). */
  readonly remoteId: string;
  /** El código con que Norde ve el aviso, si ya tiene uno (`codigoAviso`). */
  readonly code: string | undefined;
  /** La clave interna con la que lo cargó la inmobiliaria (en Tokko, el código de referencia). */
  readonly reference: string | undefined;
  readonly title: string;
  /** El plan con el que está publicado. */
  readonly plan: string | undefined;
  /** La ubicación como la muestra el portal ("Mataderos, Capital Federal"). */
  readonly location: string | undefined;
  readonly permalink: string | undefined;
  /** Un emprendimiento (o una de sus unidades): se vincula con los emprendimientos. */
  readonly isDevelopment: boolean;
}

/**
 * Los avisos que la cuenta tiene online en el portal, para vincular los que publicó otro sistema
 * sin republicarlos.
 */
export interface PortalListingCatalog {
  /** Una página de avisos online. Con `remoteId`, solo ese aviso. */
  online(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }): Promise<Result<PageSlice<RemoteListing>, PortalNotConfiguredError | PortalUnavailableError>>;

  /**
   * Toma el aviso para la publicación `listingId`: desde ahí, Norde lo maneja con el código que usa
   * para sus avisos. Devuelve ese código (el `externalId` de la publicación) y el link del aviso.
   */
  link(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
  }): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  >;
}

/** Una propiedad de la cartera con su código de referencia (módulo properties, por ID). */
export interface PropertyByCode {
  readonly propertyId: string;
  readonly code: string;
  readonly title: string;
  readonly developmentId: string | undefined;
}

/** Busca propiedades por código de referencia: lo implementa el panel con el módulo properties. */
export interface PropertyCodeLookup {
  byCodes(codes: readonly string[]): Promise<readonly PropertyByCode[]>;
}
