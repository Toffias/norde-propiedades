import type {
  ListingOperation,
  ListingPropertyKind,
  ListingSource,
  ListingSourceContact,
  ListingSourcePhoto,
  PropertyListingContent,
} from '@norde/core/portals';
import { z } from 'zod';

// Traducción pura de una publicación al aviso de la API de Open Navent (Zonaprop). Los IDs salen
// de los catálogos de la API (`/v1/tipopropiedades`, `/v1/tipopropiedades/{id}/caracteristicas`).

/** `tipoDePropiedad.idTipo` de cada tipo de propiedad. */
export const PROPERTY_TYPE_IDS: Readonly<Record<ListingPropertyKind, string>> = {
  apartment: '2',
  house: '1',
  ph: '2001',
  land: '26',
  office: '4',
  commercial: '5',
  garage: '32',
  warehouse: '8',
  storage: '45',
};

const OPERATIONS: Readonly<Record<ListingOperation, string>> = {
  sale: 'VENTA',
  rent: 'ALQUILER',
  temporary_rent: 'ALQUILER_TEMPORAL',
};

/** Características principales: las mismas para todos los tipos. */
const MAIN = {
  rooms: 'CFT1',
  bedrooms: 'CFT2',
  bathrooms: 'CFT3',
  toilets: 'CFT4',
  ageYears: 'CFT5',
  expenses: 'CFT6',
  parkingSpaces: 'CFT7',
  surfaceTotal: 'CFT100',
  surfaceCovered: 'CFT101',
} as const;

const SURFACE_UNIT = 'CON1';
const ORIENTATION = '1000029';
const DISPOSITION = '1000019';
const CREDIT_ELIGIBLE = '1000001';
const FURNISHED = '1000040';
const PROFESSIONAL_USE = '1000004';

const ORIENTATIONS: Readonly<Record<string, string>> = {
  north: '1000051',
  south: '1000052',
  east: '1000053',
  west: '1000054',
  northeast: '1000055',
  northwest: '1000056',
  southeast: '1000057',
  southwest: '1000058',
};

const DISPOSITIONS: Readonly<Record<string, string>> = {
  front: '1000029',
  back: '1000030',
  internal: '1000031',
  lateral: '1000032',
};

/** Zonaprop toma las primeras 50 fotos válidas. */
export const ZONAPROP_MAX_PICTURES = 50;
export const TITLE_MAX = 80;
export const DESCRIPTION_MIN = 50;

/**
 * El código del aviso en Zonaprop: lo elige Norde. Es el ID de la publicación sin guiones, así no
 * cambia aunque cambie el código de referencia de la propiedad.
 */
export function listingCode(listingId: string): string {
  return listingId.replaceAll('-', '');
}

/**
 * El link público del aviso. La API no lo devuelve, pero Zonaprop redirige
 * `/propiedades/clasificado/-{idAviso}.html` a la URL del aviso con su título.
 */
export function listingPermalink(remoteId: string | number): string {
  return `https://www.zonaprop.com.ar/propiedades/clasificado/-${String(remoteId)}.html`;
}

/** Lo que le falta a la publicación para Zonaprop, en español para la ficha. Vacío: se manda. */
export function listingProblems(content: PropertyListingContent): string[] {
  const { source } = content;
  const problems: string[] = [];
  if (content.plan === undefined) problems.push('Elegí el plan de Zonaprop.');
  if (source.coordinates === undefined) {
    problems.push(
      'Falta la ubicación en el mapa (latitud y longitud): Zonaprop la usa para ubicar la propiedad.',
    );
  }
  if (source.description.trim().length < DESCRIPTION_MIN) {
    problems.push(
      `Zonaprop pide una descripción de al menos ${String(DESCRIPTION_MIN)} caracteres.`,
    );
  }
  return problems;
}

type Characteristic =
  | { readonly id: string; readonly valor: string }
  | { readonly id: string; readonly idValor: string };

function wholeNumber(value: number): string {
  return String(Math.round(value));
}

/** Las características del aviso: solo las cargadas. */
export function listingCharacteristics(source: ListingSource): Characteristic[] {
  const c = source.characteristics;
  const list: Characteristic[] = [];
  const add = (id: string, value: number | undefined) => {
    if (value !== undefined) list.push({ id, valor: wholeNumber(value) });
  };
  const check = (id: string, value: boolean) => {
    if (value) list.push({ id, idValor: '1' });
  };

  add(MAIN.rooms, c.rooms);
  add(MAIN.bedrooms, c.bedrooms);
  add(MAIN.bathrooms, c.bathrooms);
  add(MAIN.toilets, c.toilets);
  add(MAIN.ageYears, c.ageYears);
  add(MAIN.parkingSpaces, c.parkingSpaces);
  if (source.expensesCents !== undefined) {
    list.push({ id: MAIN.expenses, valor: (source.expensesCents / 100n).toString() });
  }
  // En un terreno, la superficie total es la del lote.
  const total = c.surfaceTotalM2 ?? (source.kind === 'land' ? c.surfaceLandM2 : undefined);
  add(MAIN.surfaceTotal, total);
  add(MAIN.surfaceCovered, c.surfaceCoveredM2);
  if (total !== undefined || c.surfaceCoveredM2 !== undefined) {
    list.push({ id: SURFACE_UNIT, idValor: 'M2' });
  }

  const orientation = c.orientation === undefined ? undefined : ORIENTATIONS[c.orientation];
  if (orientation !== undefined) list.push({ id: ORIENTATION, idValor: orientation });
  const disposition = c.disposition === undefined ? undefined : DISPOSITIONS[c.disposition];
  if (disposition !== undefined) list.push({ id: DISPOSITION, idValor: disposition });
  check(CREDIT_ELIGIBLE, source.creditEligible);
  check(FURNISHED, c.isFurnished);
  check(PROFESSIONAL_USE, c.professionalUse);
  return list;
}

/** Los precios: la operación pedida, o todas las que tienen precio (sin las "a consultar"). */
export function listingPrices(content: PropertyListingContent) {
  return content.source.operations
    .filter(
      (o) =>
        (content.operation === undefined || o.operation === content.operation) &&
        !o.priceOnRequest &&
        o.priceCents !== undefined,
    )
    .map((o) => ({
      operacion: OPERATIONS[o.operation],
      monto: ((o.priceCents ?? 0n) / 100n).toString(),
      moneda: o.currency,
    }));
}

/** Quién publica: la inmobiliaria y el contacto de la sucursal. */
export function listingPublisher(contact: ListingSourceContact, agencyCode: string) {
  return {
    codigoInmobiliaria: agencyCode,
    nombreDeContacto: contact.name,
    ...(contact.email === undefined ? {} : { emailDeContacto: contact.email }),
    ...(contact.phone === undefined ? {} : { telefonoDeContacto: contact.phone }),
  };
}

/** Dónde está: la ubicación de Zonaprop, la dirección publicada y las coordenadas. */
export function listingLocation(
  place: {
    readonly address: string | undefined;
    readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  },
  locationId: string,
) {
  return {
    idUbicacion: locationId,
    ...(place.address === undefined ? {} : { direccion: place.address }),
    ...(place.coordinates === undefined
      ? {}
      : {
          latitud: String(place.coordinates.latitude),
          longitud: String(place.coordinates.longitude),
        }),
    // Con la dirección publicada, el mapa la muestra; sin ella, solo la zona.
    muestraMapa: place.address === undefined ? 'APROXIMADO' : 'EXACTO',
  };
}

export function listingImages(photos: readonly ListingSourcePhoto[]) {
  return {
    imagenes: photos
      .slice(0, ZONAPROP_MAX_PICTURES)
      .map((photo) => ({ urlImagenOriginal: photo.url })),
  };
}

/** El cuerpo del `PUT /v1/inmobiliarias/{codigo}/avisos/{codigoAviso}`. */
export function listingBody(
  content: PropertyListingContent,
  context: { readonly agencyCode: string; readonly locationId: string },
) {
  const { source } = content;
  return {
    codigoAviso: listingCode(content.listingId),
    publicador: listingPublisher(source.contact, context.agencyCode),
    publicacion: { tipoDePublicacion: content.plan },
    titulo: source.title.slice(0, TITLE_MAX),
    descripcion: source.description,
    tipoDePropiedad: { idTipo: PROPERTY_TYPE_IDS[source.kind] },
    localizacion: listingLocation(source, context.locationId),
    precios: listingPrices(content),
    caracteristicas: listingCharacteristics(source),
    multimedia: listingImages(source.photos),
    // La clave con la que Norde identifica la propiedad en el panel de Zonaprop.
    claveReferencia: source.code,
  };
}

const MessageSchema = z.object({
  messageCode: z.string().nullish(),
  messageText: z.string().nullish(),
});

/**
 * La respuesta de un `PUT` o `DELETE` de aviso (un objeto, o una lista con uno; la de un
 * emprendimiento trae uno por el emprendimiento y uno por cada unidad).
 */
const ProcessedSchema = z.object({
  idAviso: z.union([z.number(), z.string()]).nullish(),
  codigoAviso: z.string().nullish(),
  estado: z.string().nullish(),
  errors: z.array(MessageSchema).nullish(),
  error: z.boolean().nullish(),
});

export const ProcessedResponseSchema = z.union([ProcessedSchema, z.array(ProcessedSchema)]);

export type ProcessedListing = z.infer<typeof ProcessedSchema>;

export function processedOf(body: z.infer<typeof ProcessedResponseSchema> | undefined) {
  return Array.isArray(body) ? body[0] : body;
}

/** Todos los avisos de la respuesta: el emprendimiento y sus unidades, o el aviso solo. */
export function processedAll(
  body: z.infer<typeof ProcessedResponseSchema> | undefined,
): readonly ProcessedListing[] {
  if (body === undefined) return [];
  return Array.isArray(body) ? body : [body];
}

/** Sin créditos para el plan: Zonaprop lo informa con `ERR-0502`. */
const NO_CREDITS = 'ERR-0502';

/** El motivo del rechazo para la ficha, con los mensajes de Zonaprop (vienen en español). */
export function rejectionReason(body: unknown): string | undefined {
  // Un emprendimiento trae los errores de cada unidad en su propio aviso.
  const errors = processedAll(ProcessedResponseSchema.safeParse(body).data).flatMap(
    (processed) => processed.errors ?? [],
  );
  if (errors.length === 0) return undefined;
  if (errors.some((e) => e.messageCode === NO_CREDITS)) {
    return 'Zonaprop rechazó el aviso: no quedan créditos de este plan. Elegí otro plan o cargá créditos.';
  }
  const texts = errors.map((e) => e.messageText ?? e.messageCode ?? '').filter(Boolean);
  return `Zonaprop rechazó el aviso: ${texts.join(' ')}`;
}
