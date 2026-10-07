import type {
  ListingOperation,
  ListingPropertyKind,
  ListingSource,
  ListingType,
  PortalListingContent,
} from '@norde/core/portals';

// Traducción pura de una publicación al aviso de MercadoLibre (categoría, atributos, contacto). Los
// IDs salen de la API pública de categorías de MLA (`/categories/{id}/attributes`), relevados el
// 2026-10-06. Sin llamadas a la API: lo que necesita red (ubicación, token) está en el conector.

/** Hoja de la categoría por tipo y operación ("Propiedades individuales", nunca emprendimientos). */
const CATEGORIES: Readonly<Record<ListingPropertyKind, Partial<Record<ListingOperation, string>>>> =
  {
    apartment: { sale: 'MLA401686', rent: 'MLA1473', temporary_rent: 'MLA50279' },
    house: { sale: 'MLA401685', rent: 'MLA1467', temporary_rent: 'MLA50278' },
    ph: { sale: 'MLA105182', rent: 'MLA105181', temporary_rent: 'MLA105180' },
    land: { sale: 'MLA401687', rent: 'MLA1494' },
    office: { sale: 'MLA401684', rent: 'MLA50539' },
    commercial: { sale: 'MLA79244', rent: 'MLA79243' },
    garage: { sale: 'MLA50543', rent: 'MLA50542' },
    warehouse: { sale: 'MLA1477', rent: 'MLA1476' },
  };

/** Simple: el paquete de publicaciones. Destacado: el de mayor exposición. */
export const ML_LISTING_TYPES: Readonly<Record<ListingType, string>> = {
  simple: 'silver',
  featured: 'gold_premium',
};

/** Fotos por aviso de inmuebles. */
export const ML_MAX_PICTURES = 30;
const ML_MAX_TITLE = 200;

type NumericField =
  'surfaceTotal' | 'surfaceCovered' | 'rooms' | 'bedrooms' | 'bathrooms' | 'parkingSpaces';

/** Lo que MercadoLibre exige por tipo. Las cocheras vacías se mandan como 0 (decisión de Norde). */
const REQUIRED: Readonly<Record<ListingPropertyKind, readonly NumericField[]>> = {
  apartment: ['surfaceTotal', 'surfaceCovered', 'rooms', 'bedrooms', 'bathrooms', 'parkingSpaces'],
  ph: ['surfaceTotal', 'surfaceCovered', 'rooms', 'bedrooms', 'bathrooms', 'parkingSpaces'],
  house: ['surfaceTotal', 'surfaceCovered', 'bedrooms', 'bathrooms', 'parkingSpaces'],
  land: ['surfaceTotal'],
  office: ['surfaceTotal', 'surfaceCovered', 'bathrooms', 'parkingSpaces'],
  commercial: ['surfaceTotal', 'surfaceCovered', 'bathrooms', 'parkingSpaces'],
  warehouse: ['surfaceTotal', 'surfaceCovered', 'bathrooms', 'parkingSpaces'],
  garage: ['surfaceTotal'],
};

const FIELD_LABELS: Readonly<Record<NumericField, string>> = {
  surfaceTotal: 'la superficie total',
  surfaceCovered: 'la superficie cubierta',
  rooms: 'los ambientes',
  bedrooms: 'los dormitorios',
  bathrooms: 'los baños',
  parkingSpaces: 'las cocheras',
};

function numericValue(source: ListingSource, field: NumericField): number | undefined {
  const c = source.characteristics;
  switch (field) {
    case 'surfaceTotal':
      return c.surfaceTotalM2 ?? (source.kind === 'land' ? c.surfaceLandM2 : undefined);
    case 'surfaceCovered':
      return c.surfaceCoveredM2;
    case 'rooms':
      return c.rooms;
    case 'bedrooms':
      return c.bedrooms;
    case 'bathrooms':
      return c.bathrooms;
    case 'parkingSpaces':
      return c.parkingSpaces ?? 0;
  }
}

export function categoryOf(kind: ListingPropertyKind, operation: ListingOperation) {
  return CATEGORIES[kind][operation];
}

/**
 * Lo que le falta a la publicación para MercadoLibre, en español para la ficha. Vacío: se puede
 * mandar.
 */
export function listingProblems(content: PortalListingContent): string[] {
  const { source, operation } = content;
  const problems: string[] = [];
  if (operation === 'temporary_rent') {
    problems.push(
      'El alquiler temporario todavía no se publica en MercadoLibre: pide huéspedes, horarios y estadía mínima, que no cargamos.',
    );
  } else if (categoryOf(source.kind, operation) === undefined) {
    problems.push('MercadoLibre no tiene categoría para este tipo de propiedad en esta operación.');
  }
  for (const field of REQUIRED[source.kind]) {
    if (numericValue(source, field) === undefined) {
      problems.push(`Falta ${FIELD_LABELS[field]}.`);
    }
  }
  if (source.photos.length === 0) {
    problems.push(
      'MercadoLibre exige al menos una foto lista y marcada "Mostrar en la web" (en desarrollo, el storage tiene que ser S3 para firmar los links).',
    );
  }
  if (source.contact.whatsapp === undefined) {
    problems.push(
      'La sucursal de la propiedad no tiene WhatsApp: MercadoLibre lo exige en cada aviso.',
    );
  }
  if (source.location.city === undefined && source.location.neighborhood === undefined) {
    problems.push('Falta la ubicación (localidad o barrio).');
  }
  return problems;
}

export interface MlAttribute {
  readonly id: string;
  readonly value_name?: string;
  readonly value_id?: string;
}

const FACING: Readonly<Record<string, string>> = {
  north: '242327',
  south: '242328',
  east: '242329',
  west: '242330',
};

const DISPOSITION: Readonly<Record<string, string>> = {
  front: '242077',
  back: '242076',
  internal: '242078',
  lateral: '242079',
};

/** Valor de `LAND_ACCESS` "Otro": todavía no cargamos el acceso de los terrenos. */
const LAND_ACCESS_OTHER = '245047';

const RESIDENTIAL: readonly ListingPropertyKind[] = ['apartment', 'house', 'ph'];

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

function quantity(value: number): string {
  return String(Math.round(value));
}

function area(value: number): string {
  return `${Number(value.toFixed(2))} m²`;
}

/** Los atributos del aviso: los obligatorios de la categoría y los opcionales que tenemos. */
export function listingAttributes(content: PortalListingContent): MlAttribute[] {
  const { source, operation } = content;
  const c = source.characteristics;
  const attributes: MlAttribute[] = [];
  const add = (id: string, value: string | undefined) => {
    if (value !== undefined) attributes.push({ id, value_name: value });
  };
  const required = REQUIRED[source.kind];
  const has = (field: NumericField) => required.includes(field);

  const total = numericValue(source, 'surfaceTotal');
  add('TOTAL_AREA', total === undefined ? undefined : area(total));
  if (has('surfaceCovered') || c.surfaceCoveredM2 !== undefined) {
    add('COVERED_AREA', c.surfaceCoveredM2 === undefined ? undefined : area(c.surfaceCoveredM2));
  }
  if (source.kind !== 'land' && source.kind !== 'garage') {
    if (RESIDENTIAL.includes(source.kind)) {
      add('ROOMS', c.rooms === undefined ? undefined : quantity(c.rooms));
      add('BEDROOMS', c.bedrooms === undefined ? undefined : quantity(c.bedrooms));
      if (c.toilets !== undefined) add('HAS_HALF_BATH', yesNo(c.toilets > 0));
    }
    add('FULL_BATHROOMS', c.bathrooms === undefined ? undefined : quantity(c.bathrooms));
    add('PARKING_LOTS', quantity(c.parkingSpaces ?? 0));
  }
  if (source.kind === 'land') attributes.push({ id: 'LAND_ACCESS', value_id: LAND_ACCESS_OTHER });

  add('PROPERTY_AGE', c.ageYears === undefined ? undefined : `${quantity(c.ageYears)} años`);
  if (source.expensesCents !== undefined) {
    add('MAINTENANCE_FEE', `${quantity(Number(source.expensesCents) / 100)} ARS`);
  }
  const facing = c.orientation === undefined ? undefined : FACING[c.orientation];
  if (facing !== undefined && ['apartment', 'house', 'ph', 'office'].includes(source.kind)) {
    attributes.push({ id: 'FACING', value_id: facing });
  }
  const disposition = c.disposition === undefined ? undefined : DISPOSITION[c.disposition];
  if (disposition !== undefined && ['apartment', 'ph', 'office'].includes(source.kind)) {
    attributes.push({ id: 'DISPOSITION', value_id: disposition });
  }
  if (source.kind === 'apartment' || source.kind === 'house') {
    add('FURNISHED', yesNo(c.isFurnished));
    add('PROFESSIONAL_USE_ALLOWED', yesNo(c.professionalUse));
  }
  if (operation === 'sale' && RESIDENTIAL.includes(source.kind)) {
    add('SUITABLE_FOR_MORTGAGE_LOAN', yesNo(source.creditEligible));
  }
  if (!(source.kind === 'ph' && operation === 'sale')) add('PROPERTY_CODE', source.code);
  return attributes;
}

/** `+5491166000000` → `{ countryCode: '54', number: '91166000000' }`. Solo números de Argentina. */
export function splitPhone(e164: string | undefined) {
  if (e164 === undefined) return undefined;
  const digits = e164.replace(/\D/g, '');
  if (!digits.startsWith('54') || digits.length < 10) return undefined;
  return { countryCode: '54', number: digits.slice(2) };
}

/** El contacto del aviso. MercadoLibre exige el WhatsApp (`country_code2` y `phone2`). */
export function sellerContact(source: ListingSource) {
  const phone = splitPhone(source.contact.phone);
  const whatsapp = splitPhone(source.contact.whatsapp);
  return {
    contact: source.contact.name.slice(0, 60),
    ...(source.contact.email === undefined ? {} : { email: source.contact.email }),
    ...(phone === undefined ? {} : { country_code: phone.countryCode, phone: phone.number }),
    ...(whatsapp === undefined
      ? {}
      : { country_code2: whatsapp.countryCode, phone2: whatsapp.number }),
  };
}

export function listingTitle(source: ListingSource): string {
  return source.title.trim().slice(0, ML_MAX_TITLE);
}

/** El precio de la operación, en unidades enteras de la moneda. */
export function listingPrice(content: PortalListingContent) {
  const offered = content.source.operations.find((o) => o.operation === content.operation);
  if (offered?.priceCents === undefined) return undefined;
  return { price: Math.round(Number(offered.priceCents) / 100), currency: offered.currency };
}

export function listingPictures(source: ListingSource) {
  return source.photos.slice(0, ML_MAX_PICTURES).map((photo) => ({ source: photo.url }));
}
