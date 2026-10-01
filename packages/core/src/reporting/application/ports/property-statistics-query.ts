import type { PropertyInterestProfile } from '../../../clients';
import type { PortalPublicationStats } from '../../contracts';

export interface StatisticsRange {
  /** Inclusive. */
  readonly from: Date;
  /** Exclusive. */
  readonly to: Date;
}

/**
 * Agregados de la actividad de una propiedad, calculados en la base: envíos, consultas,
 * interesados y publicaciones. Cada lista está acotada (meses, portales, etiquetas).
 */
export interface PropertyStatisticsQuery {
  /** Envíos y consultas por mes (`AAAA-MM`), solo los meses con actividad. */
  monthly(
    propertyId: string,
    range: StatisticsRange,
  ): Promise<
    readonly {
      readonly month: string;
      readonly emailSends: number;
      readonly whatsappSends: number;
      readonly inquiries: number;
    }[]
  >;
  interestedCount(profile: PropertyInterestProfile): Promise<number>;
  interestedTags(
    profile: PropertyInterestProfile,
    limit: number,
  ): Promise<
    readonly { readonly tagId: string; readonly name: string; readonly clients: number }[]
  >;
  /** Una fila por portal; las vistas, contactos y favoritos suman los días del rango. */
  publications(
    propertyId: string,
    range: StatisticsRange,
  ): Promise<readonly PortalPublicationStats[]>;
}
