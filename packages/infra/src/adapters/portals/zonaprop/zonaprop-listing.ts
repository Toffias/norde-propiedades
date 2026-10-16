import type {
  ListingOperation,
  ListingPropertyKind,
  ListingSource,
  PortalListingContent,
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
const TITLE_MAX = 80;
const DESCRIPTION_MIN = 50;

/**
 * El código del aviso en Zonaprop: lo elige Norde. Es el ID de la publicación sin guiones, así no
 * cambia aunque cambie el código de referencia de la propiedad.
 */
export function listingCode(listingId: string): string {
  return listingId.replaceAll('-', '');
}

/** Lo que le falta a la publicación para Zonaprop, en español para la ficha. Vacío: se manda. */
export function listingProblems(content: PortalListingContent): string[] {
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
export function listingPrices(content: PortalListingContent) {
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

/** El cuerpo del `PUT /v1/inmobiliarias/{codigo}/avisos/{codigoAviso}`. */
export function listingBody(
  content: PortalListingContent,
  context: { readonly agencyCode: string; readonly locationId: string },
) {
  const { source } = content;
  const { contact } = source;
  return {
    codigoAviso: listingCode(content.listingId),
    publicador: {
      codigoInmobiliaria: context.agencyCode,
      nombreDeContacto: contact.name,
      ...(contact.email === undefined ? {} : { emailDeContacto: contact.email }),
      ...(contact.phone === undefined ? {} : { telefonoDeContacto: contact.phone }),
    },
    publicacion: { tipoDePublicacion: content.plan },
    titulo: source.title.slice(0, TITLE_MAX),
    descripcion: source.description,
    tipoDePropiedad: { idTipo: PROPERTY_TYPE_IDS[source.kind] },
    localizacion: {
      idUbicacion: context.locationId,
      ...(source.address === undefined ? {} : { direccion: source.address }),
      ...(source.coordinates === undefined
        ? {}
        : {
            latitud: String(source.coordinates.latitude),
            longitud: String(source.coordinates.longitude),
          }),
      // Con la dirección publicada, el mapa la muestra; sin ella, solo la zona.
      muestraMapa: source.address === undefined ? 'APROXIMADO' : 'EXACTO',
    },
    precios: listingPrices(content),
    caracteristicas: listingCharacteristics(source),
    multimedia: {
      imagenes: source.photos
        .slice(0, ZONAPROP_MAX_PICTURES)
        .map((photo) => ({ urlImagenOriginal: photo.url })),
    },
    // La clave con la que Norde identifica la propiedad en el panel de Zonaprop.
    claveReferencia: source.code,
  };
}

const MessageSchema = z.object({
  messageCode: z.string().nullish(),
  messageText: z.string().nullish(),
});

/** La respuesta de un `PUT` o `DELETE` de aviso (un objeto, o una lista con uno). */
const ProcessedSchema = z.object({
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

/** Sin créditos para el plan: Zonaprop lo informa con `ERR-0502`. */
const NO_CREDITS = 'ERR-0502';

/** El motivo del rechazo para la ficha, con los mensajes de Zonaprop (vienen en español). */
export function rejectionReason(body: unknown): string | undefined {
  const processed = processedOf(ProcessedResponseSchema.safeParse(body).data);
  const errors = processed?.errors ?? [];
  if (errors.length === 0) return undefined;
  if (errors.some((e) => e.messageCode === NO_CREDITS)) {
    return 'Zonaprop rechazó el aviso: no quedan créditos de este plan. Elegí otro plan o cargá créditos.';
  }
  const texts = errors.map((e) => e.messageText ?? e.messageCode ?? '').filter(Boolean);
  return `Zonaprop rechazó el aviso: ${texts.join(' ')}`;
}
