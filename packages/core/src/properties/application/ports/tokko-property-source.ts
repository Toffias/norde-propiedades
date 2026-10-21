import type { Result } from '../../../shared';

// La API de Tokko (`/api/v1/property/`), leída por infra y validada con Zod. Los datos llegan como
// los da Tokko (textos, números y "sin dato" como `undefined`); el caso de uso los traduce a Norde
// con las mismas reglas que la exportación (`domain/tokko-property.ts`).

/** Un precio de una operación. */
export interface TokkoApiPrice {
  /** "USD" o "ARS". */
  readonly currency: string;
  /** En unidades, no en centavos. */
  readonly amount: number;
}

/** Una operación: 1 venta, 2 alquiler, 3 alquiler temporario. */
export interface TokkoApiOperation {
  readonly operationId: number;
  readonly prices: readonly TokkoApiPrice[];
}

/** Un propietario de la propiedad (sus datos personales no se loguean). */
export interface TokkoApiOwner {
  readonly name: string;
  readonly phone: string | undefined;
  readonly email: string | undefined;
}

/** Una foto o un plano, en el orden y con la portada de Tokko. */
export interface TokkoApiPhoto {
  /** La original, en `static.tokkobroker.com`. */
  readonly url: string;
  /** La versión web, por si la original no se puede usar. */
  readonly fallbackUrl: string | undefined;
  readonly order: number;
  readonly isCover: boolean;
  readonly isFloorPlan: boolean;
}

export interface TokkoApiProperty {
  readonly referenceCode: string;
  /** El nombre del tipo en español ("Departamento", "Casa"). */
  readonly typeName: string;
  readonly address: string;
  /** Piso y unidad, cuando Tokko los tiene aparte de la dirección. */
  readonly floor: string | undefined;
  readonly unit: string | undefined;
  /** "Argentina | Capital Federal | Mataderos". */
  readonly fullLocation: string;
  readonly producerName: string | undefined;
  readonly operations: readonly TokkoApiOperation[];
  /** Si la web muestra el precio; si no, es "a consultar". */
  readonly showPrice: boolean;
  /** Medidas como las escribe Tokko ("75.00"). */
  readonly surfaceTotal: string | undefined;
  readonly surfaceLand: string | undefined;
  readonly surfaceCovered: string | undefined;
  readonly surfaceSemiCovered: string | undefined;
  readonly surfaceUncovered: string | undefined;
  readonly front: string | undefined;
  readonly depth: string | undefined;
  /** Cantidades; `-1` es "sin dato". */
  readonly rooms: number | undefined;
  readonly bedrooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly toilets: number | undefined;
  readonly parkingSpaces: number | undefined;
  readonly age: number | undefined;
  /** En pesos. */
  readonly expenses: number | undefined;
  readonly floors: number | undefined;
  readonly zoning: string | undefined;
  readonly title: string | undefined;
  readonly description: string | undefined;
  /** Los comentarios internos que cargaron en Tokko. */
  readonly internalComments: string | undefined;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  readonly owners: readonly TokkoApiOwner[];
  /** El emprendimiento del que es unidad: su código de Tokko y su nombre. */
  readonly developmentCode: string | undefined;
  readonly developmentName: string | undefined;
  readonly photos: readonly TokkoApiPhoto[];
}

/** Un emprendimiento de Tokko (`/api/v1/development/`). */
export interface TokkoApiDevelopment {
  readonly referenceCode: string;
  readonly name: string;
  /** El código del tipo ("BU": edificio). */
  readonly typeCode: string;
  readonly address: string;
  readonly fullLocation: string;
  /** El estado de obra, como número de Tokko. */
  readonly constructionStatus: number | undefined;
  /** La fecha de entrega, como la escribe Tokko. */
  readonly constructionDate: string | undefined;
  /** Si estaba publicado en la web de Tokko. */
  readonly displayOnWeb: boolean;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly financingDetails: string | undefined;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  /** El usuario a cargo en Tokko. */
  readonly producerName: string | undefined;
  readonly photos: readonly TokkoApiPhoto[];
}

export interface TokkoApiDevelopmentPage {
  readonly total: number;
  readonly developments: readonly TokkoApiDevelopment[];
}

export interface TokkoApiPage {
  /** Cuántas propiedades hay en total en el listado. */
  readonly total: number;
  readonly properties: readonly TokkoApiProperty[];
}

/** Tokko no respondió, rechazó la key o respondió algo que no se entiende. */
export interface TokkoUnavailableError {
  readonly type: 'TokkoUnavailable';
}

export interface DownloadedPhoto {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** No se pudo bajar la foto (no responde, no es una imagen o pesa demasiado). */
export interface PhotoUnavailableError {
  readonly type: 'PhotoUnavailable';
}

/** Las propiedades de Norde en Tokko, de a páginas, y sus fotos. */
export interface TokkoPropertySource {
  /** Una página del listado, en el orden de Tokko. */
  page(offset: number, limit: number): Promise<Result<TokkoApiPage, TokkoUnavailableError>>;
  /** Una página de los emprendimientos, en el orden de Tokko. */
  developments(
    offset: number,
    limit: number,
  ): Promise<Result<TokkoApiDevelopmentPage, TokkoUnavailableError>>;
  /** Baja una foto: solo de los servidores de Tokko. */
  photo(url: string): Promise<Result<DownloadedPhoto, PhotoUnavailableError>>;
}
