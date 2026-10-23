import type { PageSlice } from '../../../shared';
import type { LocationKindValue } from '../../contracts';
import type { PropertyStatus } from '../../domain/property-status';

export interface PublicLocationRecord {
  readonly id: string;
  readonly kind: LocationKindValue;
  readonly name: string;
  /** Nombres de los ancestros, de la raíz al padre. */
  readonly ancestors: readonly string[];
  /** Propiedades publicadas en la ubicación o en sus descendientes. */
  readonly listingCount: number;
}

export interface PublicLocationCriteria {
  /** Nombre normalizado o no: lo normaliza infra. */
  readonly text?: string | undefined;
  readonly ids?: readonly string[] | undefined;
  /** Qué cuenta como publicada (lo decide el dominio). */
  readonly statuses: readonly PropertyStatus[];
  readonly offset: number;
  readonly limit: number;
}

/**
 * Ubicaciones del catálogo (sin países) que tienen al menos una propiedad publicada en la web,
 * contando sus descendientes. Con `text`, ordenadas por parecido (nombre igual, empieza igual,
 * contiene) y después por cantidad de propiedades.
 */
export interface PublicLocationQuery {
  search(criteria: PublicLocationCriteria): Promise<PageSlice<PublicLocationRecord>>;
}
