import type { ListingOperation, OwnerAvailability } from '../../domain/listing';

export type ListingPropertyKind =
  'apartment' | 'house' | 'ph' | 'land' | 'office' | 'commercial' | 'garage' | 'warehouse';

export interface ListingSourceOperation {
  readonly operation: ListingOperation;
  readonly currency: 'ARS' | 'USD';
  readonly priceCents: bigint | undefined;
  readonly priceOnRequest: boolean;
}

export interface ListingSourcePhoto {
  readonly id: string;
  /** Cambia si cambia la foto: entra en la huella del contenido (la URL firmada no). */
  readonly version: string;
  /** Link firmado que el portal descarga al recibir el aviso. */
  readonly url: string;
}

/** Contacto que el portal muestra en el aviso: el de la sucursal del captador. */
export interface ListingSourceContact {
  readonly name: string;
  readonly email: string | undefined;
  /** E.164 (`+5491166899124`). */
  readonly phone: string | undefined;
  /** E.164. MercadoLibre lo exige en todo aviso de inmuebles. */
  readonly whatsapp: string | undefined;
}

/**
 * Todo lo que se publica de una propiedad, ya armado: textos con el pie de Mi empresa, dirección
 * para publicar, fotos firmadas y contacto. Lo arma el panel con las APIs públicas de properties,
 * settings e identity.
 */
export interface ListingSource {
  readonly propertyId: string;
  readonly code: string;
  readonly kind: ListingPropertyKind;
  readonly availability: OwnerAvailability;
  /** Las unidades se publican con su emprendimiento. */
  readonly developmentId: string | undefined;
  readonly title: string;
  /** Descripción con el pie para portales de Mi empresa. */
  readonly description: string;
  readonly operations: readonly ListingSourceOperation[];
  /** La dirección que se publica (nunca piso ni unidad). */
  readonly address: string | undefined;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  /** Nombres de la ubicación del catálogo, de lo general a lo particular. */
  readonly location: {
    readonly province: string | undefined;
    readonly city: string | undefined;
    readonly neighborhood: string | undefined;
  };
  readonly characteristics: {
    readonly rooms: number | undefined;
    readonly bedrooms: number | undefined;
    readonly bathrooms: number | undefined;
    readonly toilets: number | undefined;
    readonly parkingSpaces: number | undefined;
    readonly ageYears: number | undefined;
    readonly orientation: string | undefined;
    readonly disposition: string | undefined;
    readonly isFurnished: boolean;
    readonly professionalUse: boolean;
    readonly surfaceTotalM2: number | undefined;
    readonly surfaceCoveredM2: number | undefined;
    readonly surfaceLandM2: number | undefined;
  };
  /** Expensas en pesos. */
  readonly expensesCents: bigint | undefined;
  readonly creditEligible: boolean;
  readonly photos: readonly ListingSourcePhoto[];
  readonly contact: ListingSourceContact;
}

export interface ListingSourceReader {
  /** `undefined` si la propiedad no existe (ni en la papelera). */
  read(propertyId: string): Promise<ListingSource | undefined>;
}
