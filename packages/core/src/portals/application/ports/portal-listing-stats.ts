import type { Result } from '../../../shared';
import type { PortalId } from '../../domain/portal';
import type { PortalUnavailableError } from './portal-authorizer';
import type { PortalCredentialsMissingError } from './portal-connector';

/**
 * Lo que la gente hizo con un aviso en el portal: visitas y contactos de los últimos días, y las
 * visitas de toda su vida. Son cantidades: quién contactó entra por la bandeja de consultas.
 */
export interface PortalListingStats {
  /** Visitas desde que se publicó. */
  readonly totalVisits: number;
  /** Visitas en el período. */
  readonly visits: number;
  /** Preguntas o pedidos de contacto en el período. */
  readonly questions: number;
  /** Veces que vieron el teléfono en el período. */
  readonly phoneViews: number;
  /** Veces que fueron al WhatsApp en el período. */
  readonly whatsapp: number;
}

/** Las estadísticas de un aviso, leídas del portal en el momento (MercadoLibre). */
export interface PortalListingStatsReader {
  /** Las del aviso `externalId`, en los `days` días que terminan en `endingAt`. */
  stats(input: {
    readonly portal: PortalId;
    readonly externalId: string;
    readonly endingAt: Date;
    readonly days: number;
  }): Promise<Result<PortalListingStats, PortalUnavailableError | PortalCredentialsMissingError>>;
}
