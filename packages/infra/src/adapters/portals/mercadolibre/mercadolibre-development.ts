import type {
  DevelopmentListingContent,
  ListingConstructionStage,
  ListingPropertyKind,
  ListingSource,
} from '@norde/core/portals';

import type { MlAttribute } from './mercadolibre-listing';

// Traducción pura de un emprendimiento al aviso de MercadoLibre: un ítem en la categoría
// "Emprendimientos" con las unidades en venta como variaciones. Los IDs salen de la API pública de
// categorías de MLA (`/categories/{id}` y `/categories/{id}/attributes`), relevados el 2026-10-18.

/** Los tipos que ML publica como emprendimiento, en orden de preferencia a la par. */
const DEVELOPMENT_KINDS = ['apartment', 'house', 'office', 'land'] as const;

/** Las hojas "Emprendimientos": ML solo las tiene en venta y para estos cuatro tipos. */
export const DEVELOPMENT_CATEGORIES: Readonly<Partial<Record<ListingPropertyKind, string>>> = {
  apartment: 'MLA401806',
  house: 'MLA401805',
  office: 'MLA401804',
  land: 'MLA401803',
};

/** `POSSESSION_STATUS`: venta en blanco, venta en verde, entrega inmediata. */
const POSSESSION_STATUS: Readonly<Record<ListingConstructionStage, string>> = {
  pre_sale: '242414',
  under_construction: '27191631',
  finished: '242413',
};

/** Lo que admite cada categoría: variaciones, fotos del ítem y fotos por variación. */
export const ML_MAX_VARIATIONS = 300;
const MAX_PICTURES: Readonly<Partial<Record<ListingPropertyKind, number>>> = { land: 100 };
const MAX_PICTURES_PER_VARIATION: Readonly<Partial<Record<ListingPropertyKind, number>>> = {
  land: 30,
};
const DEFAULT_MAX_PICTURES = 200;
/** Fotos del emprendimiento en el ítem: el resto del cupo queda para las de las unidades. */
const DEVELOPMENT_PICTURES = 30;
/** Fotos propias de cada unidad en su variación. */
const UNIT_PICTURES = 3;
const ML_DEVELOPMENT_TITLE = 140;

type UnitField = 'surfaceTotal' | 'surfaceCovered' | 'rooms' | 'bedrooms' | 'bathrooms';

/** Lo que ML exige de cada variación, por categoría (las cocheras vacías van como 0). */
const REQUIRED: Readonly<Partial<Record<ListingPropertyKind, readonly UnitField[]>>> = {
  apartment: ['surfaceTotal', 'surfaceCovered', 'rooms', 'bedrooms', 'bathrooms'],
  house: ['surfaceTotal', 'surfaceCovered', 'bedrooms', 'bathrooms'],
  office: ['surfaceCovered', 'bathrooms'],
  land: ['surfaceTotal'],
};

const FIELD_LABELS: Readonly<Record<UnitField, string>> = {
  surfaceTotal: 'la superficie total',
  surfaceCovered: 'la superficie cubierta',
  rooms: 'los ambientes',
  bedrooms: 'los dormitorios',
  bathrooms: 'los baños',
};

function fieldValue(unit: ListingSource, field: UnitField): number | undefined {
  const c = unit.characteristics;
  switch (field) {
    case 'surfaceTotal':
      return c.surfaceTotalM2 ?? (unit.kind === 'land' ? c.surfaceLandM2 : undefined);
    case 'surfaceCovered':
      return c.surfaceCoveredM2;
    case 'rooms':
      return c.rooms;
    case 'bedrooms':
      return c.bedrooms;
    case 'bathrooms':
      return c.bathrooms;
  }
}

/** El precio de venta de la unidad, si lo tiene (sin "precio a consultar"). */
function salePrice(unit: ListingSource) {
  const sale = unit.operations.find((o) => o.operation === 'sale');
  if (sale?.priceCents === undefined || sale.priceOnRequest) return undefined;
  return { price: Math.round(Number(sale.priceCents) / 100), currency: sale.currency };
}

/**
 * El tipo de unidad del aviso: el más común entre las unidades en venta de los tipos que ML
 * publica como emprendimiento (a la par, en el orden de `DEVELOPMENT_KINDS`).
 */
export function developmentUnitKind(
  source: DevelopmentListingContent['source'],
): ListingPropertyKind | undefined {
  const counts = new Map<ListingPropertyKind, number>();
  for (const unit of source.units) {
    if (DEVELOPMENT_CATEGORIES[unit.kind] === undefined || salePrice(unit) === undefined) continue;
    counts.set(unit.kind, (counts.get(unit.kind) ?? 0) + 1);
  }
  let best: ListingPropertyKind | undefined;
  for (const kind of DEVELOPMENT_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count > 0 && (best === undefined || count > (counts.get(best) ?? 0))) best = kind;
  }
  return best;
}

/** Las unidades que van en el aviso: en venta, con precio y del tipo del aviso. */
export function developmentUnits(source: DevelopmentListingContent['source']): ListingSource[] {
  const kind = developmentUnitKind(source);
  return source.units.filter((unit) => unit.kind === kind && salePrice(unit) !== undefined);
}

export function developmentCategory(source: DevelopmentListingContent['source']) {
  const kind = developmentUnitKind(source);
  return kind === undefined ? undefined : DEVELOPMENT_CATEGORIES[kind];
}

/**
 * Lo que le falta al emprendimiento para MercadoLibre, en español para la ficha. Vacío: se manda.
 * Sin unidades no se queja: el aviso se pausa (lo decide el core).
 */
export function developmentProblems(content: DevelopmentListingContent): string[] {
  const { source } = content;
  const problems: string[] = [];
  const units = developmentUnits(source);
  if (source.units.length > 0 && units.length === 0) {
    problems.push(
      'MercadoLibre solo publica emprendimientos de departamentos, casas, oficinas o lotes en venta: ninguna unidad disponible es de esos tipos con precio de venta.',
    );
  }
  if (units.length > ML_MAX_VARIATIONS) {
    problems.push(
      `MercadoLibre admite hasta ${String(ML_MAX_VARIATIONS)} unidades por emprendimiento.`,
    );
  }
  const currencies = new Set(units.map((unit) => salePrice(unit)?.currency));
  if (currencies.size > 1) {
    problems.push(
      'Las unidades tienen precios en monedas distintas: MercadoLibre pide una sola moneda por emprendimiento.',
    );
  }
  for (const unit of units) {
    const missing = (REQUIRED[unit.kind] ?? [])
      .filter((field) => fieldValue(unit, field) === undefined)
      .map((field) => FIELD_LABELS[field]);
    if (missing.length > 0) {
      problems.push(`A la unidad ${unit.code} le falta ${missing.join(', ')}.`);
    }
  }
  if (source.photos.length === 0 && units.some((unit) => unit.photos.length === 0)) {
    problems.push(
      'MercadoLibre exige una foto en cada unidad: cargá fotos del emprendimiento (se usan en las unidades sin fotos propias).',
    );
  }
  if (source.stage === undefined) {
    problems.push('Falta la etapa de la obra (en pozo, en construcción o terminado).');
  }
  if (!source.contact.fromBranch) {
    problems.push(
      'El emprendimiento no tiene sucursal, y MercadoLibre exige el WhatsApp de la sucursal en cada aviso.',
    );
  } else if (source.contact.whatsapp === undefined) {
    problems.push(
      `La sucursal ${source.contact.name} no tiene WhatsApp: cargalo en Mi empresa → Sucursales. MercadoLibre lo exige en cada aviso.`,
    );
  }
  if (source.location.city === undefined && source.location.neighborhood === undefined) {
    problems.push('Falta la ubicación (localidad o barrio).');
  }
  return problems;
}

function area(value: number): string {
  return `${Number(value.toFixed(2))} m²`;
}

function quantity(value: number): string {
  return String(Math.round(value));
}

/** "Piso 3 · B", "PB · 2", "Lote 14"; sin piso ni unidad, el código de la unidad. */
export function unitName(unit: ListingSource): string {
  const floor = unit.unitDesignation?.floor;
  const name = unit.unitDesignation?.unit;
  const floorText = floor === undefined ? undefined : /^\d+$/.test(floor) ? `Piso ${floor}` : floor;
  const parts = [floorText, name].filter((part) => part !== undefined);
  return parts.length > 0 ? parts.join(' · ') : unit.code;
}

/** La tipología de la unidad, que ML muestra como "modelo". */
export function modelName(unit: ListingSource): string {
  const c = unit.characteristics;
  if (unit.kind === 'apartment') {
    return c.rooms === undefined || c.rooms <= 1
      ? 'Monoambiente'
      : `${quantity(c.rooms)} ambientes`;
  }
  if (unit.kind === 'house') {
    return c.bedrooms === undefined ? 'Casa' : `Casa de ${quantity(c.bedrooms)} dormitorios`;
  }
  if (unit.kind === 'land') {
    const total = fieldValue(unit, 'surfaceTotal');
    return total === undefined ? 'Lote' : `Lote de ${area(total)}`;
  }
  // Las oficinas: el resto de los tipos no llega al aviso de un emprendimiento.
  return c.surfaceCoveredM2 === undefined ? 'Oficina' : `Oficina de ${area(c.surfaceCoveredM2)}`;
}

/** Los atributos de la variación (`attribute_combinations`), según la categoría. */
function unitAttributes(unit: ListingSource, name: string): MlAttribute[] {
  const c = unit.characteristics;
  const attributes: MlAttribute[] = [
    { id: 'UNIT_NAME', value_name: name },
    { id: 'MODEL_NAME', value_name: modelName(unit) },
  ];
  const add = (id: string, value: string | undefined) => {
    if (value !== undefined) attributes.push({ id, value_name: value });
  };
  const required = REQUIRED[unit.kind] ?? [];
  const total = fieldValue(unit, 'surfaceTotal');
  add('TOTAL_AREA', total === undefined ? undefined : area(total));
  if (required.includes('surfaceCovered')) {
    add('COVERED_AREA', c.surfaceCoveredM2 === undefined ? undefined : area(c.surfaceCoveredM2));
  }
  if (required.includes('rooms'))
    add('ROOMS', c.rooms === undefined ? undefined : quantity(c.rooms));
  if (required.includes('bedrooms')) {
    add('BEDROOMS', c.bedrooms === undefined ? undefined : quantity(c.bedrooms));
  }
  if (required.includes('bathrooms')) {
    add('FULL_BATHROOMS', c.bathrooms === undefined ? undefined : quantity(c.bathrooms));
  }
  if (unit.kind !== 'land') add('PARKING_LOTS', quantity(c.parkingSpaces ?? 0));
  return attributes;
}

/** Una variación ya publicada: su ID en ML y la unidad que es (`seller_custom_field`). */
export interface ExistingVariation {
  readonly id: number;
  readonly unitId: string | undefined;
}

/**
 * Lo que se manda del emprendimiento: título, precio (el de la unidad más barata, como lo pone ML),
 * fotos, atributos y variaciones. Cada variación lleva el ID de la unidad en `seller_custom_field`
 * (así se reconoce al actualizar y en las cotizaciones) y sus fotos por URL: las del ítem incluyen
 * todas las que referencian las variaciones. Las variaciones ya publicadas van con su ID; las que
 * no se mandan, ML las borra.
 */
export function developmentItem(
  content: DevelopmentListingContent,
  existing: readonly ExistingVariation[] = [],
) {
  const { source } = content;
  const kind = developmentUnitKind(source);
  const units = developmentUnits(source).slice(0, ML_MAX_VARIATIONS);
  const maxPictures = (kind === undefined ? undefined : MAX_PICTURES[kind]) ?? DEFAULT_MAX_PICTURES;
  const perVariation = Math.min(
    UNIT_PICTURES,
    (kind === undefined ? undefined : MAX_PICTURES_PER_VARIATION[kind]) ?? UNIT_PICTURES,
  );

  const pictures: string[] = source.photos.slice(0, DEVELOPMENT_PICTURES).map((p) => p.url);
  const cover = pictures[0];
  const names = new Map<string, number>();
  for (const unit of units) names.set(unitName(unit), (names.get(unitName(unit)) ?? 0) + 1);
  const byUnit = new Map(existing.map((v) => [v.unitId, v.id]));

  const variations = units.map((unit) => {
    const own: string[] = [];
    for (const photo of unit.photos.slice(0, perVariation)) {
      if (pictures.length >= maxPictures) break;
      pictures.push(photo.url);
      own.push(photo.url);
    }
    const pictureIds =
      own.length > 0 ? own : [cover ?? unit.photos[0]?.url].filter((u) => u !== undefined);
    // Dos unidades con el mismo nombre: ML no admite variaciones iguales, va el código.
    const plain = unitName(unit);
    const name = (names.get(plain) ?? 0) > 1 ? `${plain} (${unit.code})` : plain;
    const id = byUnit.get(unit.propertyId);
    return {
      ...(id === undefined ? {} : { id }),
      price: salePrice(unit)?.price ?? 0,
      available_quantity: 1,
      seller_custom_field: unit.propertyId,
      attribute_combinations: unitAttributes(unit, name),
      picture_ids: pictureIds,
    };
  });
  // Una unidad sin fotos ni portada usa su primera foto: tiene que estar en el ítem.
  for (const variation of variations) {
    for (const url of variation.picture_ids) if (!pictures.includes(url)) pictures.push(url);
  }

  const prices = variations.map((v) => v.price);
  const currency = units.map((unit) => salePrice(unit)?.currency).find((c) => c !== undefined);
  const attributes: MlAttribute[] = [{ id: 'DEVELOPMENT_NAME', value_name: source.name }];
  if (source.stage !== undefined) {
    attributes.push({ id: 'POSSESSION_STATUS', value_id: POSSESSION_STATUS[source.stage] });
  }
  return {
    title: source.title.trim().slice(0, ML_DEVELOPMENT_TITLE),
    price: prices.length === 0 ? 0 : Math.min(...prices),
    currency_id: currency ?? 'USD',
    pictures: pictures.map((url) => ({ source: url })),
    attributes,
    variations,
  };
}
