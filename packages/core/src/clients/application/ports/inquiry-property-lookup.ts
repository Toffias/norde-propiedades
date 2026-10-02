import type { InquiryPropertyFacts } from '../../domain/inquiry-tags';

/**
 * Lo que una consulta entrante toma de la propiedad consultada (módulo properties, por su API
 * pública): tipo, operaciones, barrio y la sucursal del captador.
 */
export interface InquiryPropertyLookup {
  /** `undefined` si la propiedad no está en la cartera. */
  facts(propertyId: string): Promise<InquiryPropertyFacts | undefined>;
}
