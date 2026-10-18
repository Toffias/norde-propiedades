import type { OwnerAvailability } from '../../domain/listing';
import type { ListingSource, ListingSourceContact, ListingSourcePhoto } from './listing-source';

/** Cómo es el emprendimiento: los portales separan los verticales (edificios) de los horizontales. */
export type ListingDevelopmentKind =
  'building' | 'gated_community' | 'housing_complex' | 'office_building' | 'lots' | 'other';

/** En qué etapa está la obra. */
export type ListingConstructionStage = 'pre_sale' | 'under_construction' | 'finished';

/**
 * Todo lo que se publica de un emprendimiento, ya armado: sus textos, su ubicación, sus fotos, el
 * contacto y sus unidades disponibles (cada una como se publica una propiedad). Lo arma el panel con
 * las APIs públicas de properties, settings e identity.
 */
export interface DevelopmentListingSource {
  readonly developmentId: string;
  readonly code: string;
  readonly kind: ListingDevelopmentKind | undefined;
  /** El nombre del emprendimiento ("Torre Mataderos"); el título del aviso es otro texto. */
  readonly name: string;
  /**
   * Lo que permite el emprendimiento por sí mismo (`developmentAvailability` con las unidades que
   * trae). Sin unidades para publicar, queda en pausa.
   */
  readonly availability: OwnerAvailability;
  readonly title: string;
  /** Descripción con el pie para portales de Mi empresa. */
  readonly description: string;
  /** La dirección que se publica. */
  readonly address: string | undefined;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly location: ListingSource['location'];
  readonly stage: ListingConstructionStage | undefined;
  /** Fecha de entrega estimada, `AAAA-MM-DD`. */
  readonly deliveryDate: string | undefined;
  readonly photos: readonly ListingSourcePhoto[];
  readonly contact: ListingSourceContact;
  /** Las unidades que se publican: disponibles y con precio (`publishableUnits`). */
  readonly units: readonly ListingSource[];
}

export interface DevelopmentListingSourceReader {
  /** `undefined` si el emprendimiento no existe (ni en la papelera). */
  read(developmentId: string): Promise<DevelopmentListingSource | undefined>;
}
