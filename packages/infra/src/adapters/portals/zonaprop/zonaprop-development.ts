import type {
  DevelopmentListingContent,
  ListingConstructionStage,
  ListingDevelopmentKind,
  ListingSource,
} from '@norde/core/portals';

import {
  DESCRIPTION_MIN,
  PROPERTY_TYPE_IDS,
  TITLE_MAX,
  listingCharacteristics,
  listingCode,
  listingImages,
  listingLocation,
  listingPrices,
  listingPublisher,
} from './zonaprop-listing';

// Traducción pura de un emprendimiento al aviso de desarrollo de Open Navent (Zonaprop): el
// emprendimiento con todas sus unidades. Los IDs salen de `/v1/tipopropiedades/desarrollos` y
// `/v1/desarrollo/etapas`.

/**
 * `tipoDePropiedad.idTipo`: Zonaprop separa los emprendimientos verticales (34: edificios) de los
 * horizontales (33: barrios, complejos, loteos). "Otro" no tiene tipo: se elige uno.
 */
export const DEVELOPMENT_TYPE_IDS: Readonly<Record<ListingDevelopmentKind, string | undefined>> = {
  building: '34',
  office_building: '34',
  gated_community: '33',
  housing_complex: '33',
  lots: '33',
  other: undefined,
};

/** `etapaDesarrollo`: el nombre de la etapa, como lo da `/v1/desarrollo/etapas`. */
export const DEVELOPMENT_STAGES: Readonly<Record<ListingConstructionStage, string>> = {
  pre_sale: 'En Pozo',
  under_construction: 'En Construcción',
  finished: 'Terminado',
};

/** Zonaprop pide el título del emprendimiento entre 10 y 100 caracteres. */
const DEVELOPMENT_TITLE_MIN = 10;
const DEVELOPMENT_TITLE_MAX = 100;

const UNIT_CODE = /^U([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/;

/**
 * El código de una unidad en Zonaprop: único en todo el sistema y distinto del de los avisos (que
 * son el ID de la publicación). Es el ID de la propiedad sin guiones, con una `U` adelante.
 */
export function unitCode(propertyId: string): string {
  return `U${propertyId.replaceAll('-', '')}`;
}

/** La propiedad de un código de unidad de Norde, o `undefined` si no es uno. */
export function unitPropertyId(code: string): string | undefined {
  const parts = UNIT_CODE.exec(code);
  return parts ? parts.slice(1).join('-') : undefined;
}

/** `fechaEntrega`: `MM-AAAA`. */
export function deliveryMonth(date: string): string {
  const [year, month] = date.split('-');
  return `${month ?? ''}-${year ?? ''}`;
}

/** Lo que le falta al emprendimiento para Zonaprop, en español para la ficha. Vacío: se manda. */
export function developmentProblems(content: DevelopmentListingContent): string[] {
  const { source } = content;
  const problems: string[] = [];
  if (content.plan === undefined) problems.push('Elegí el plan de Zonaprop.');
  if (source.kind === undefined || DEVELOPMENT_TYPE_IDS[source.kind] === undefined) {
    problems.push(
      'Zonaprop separa los emprendimientos en verticales (edificios) y horizontales (barrios, complejos, loteos): elegí el tipo de emprendimiento.',
    );
  }
  if (source.coordinates === undefined) {
    problems.push(
      'Falta la ubicación en el mapa (latitud y longitud): Zonaprop la usa para ubicar el emprendimiento.',
    );
  }
  if (source.title.trim().length < DEVELOPMENT_TITLE_MIN) {
    problems.push(
      `Zonaprop pide un título de al menos ${String(DEVELOPMENT_TITLE_MIN)} caracteres para el emprendimiento.`,
    );
  }
  if (source.description.trim().length < DESCRIPTION_MIN) {
    problems.push(
      `Zonaprop pide una descripción del emprendimiento de al menos ${String(DESCRIPTION_MIN)} caracteres.`,
    );
  }
  if (source.stage === undefined) {
    problems.push('Falta la etapa de la obra (en pozo, en construcción o terminado).');
  }
  if (source.deliveryDate === undefined) problems.push('Falta la fecha de entrega estimada.');
  return problems;
}

/**
 * Una unidad, como un aviso más: sus características, precios y fotos. La ubicación es la del
 * emprendimiento (Zonaprop recomienda mandarla igual). Si la unidad no tiene una descripción
 * propia que alcance, lleva la del emprendimiento.
 */
function unitBody(
  unit: ListingSource,
  development: DevelopmentListingContent['source'],
  locationId: string,
) {
  const description =
    unit.description.trim().length >= DESCRIPTION_MIN ? unit.description : development.description;
  return {
    codigoAviso: unitCode(unit.propertyId),
    titulo: unit.title.slice(0, TITLE_MAX),
    descripcion: description,
    tipoDePropiedad: { idTipo: PROPERTY_TYPE_IDS[unit.kind] },
    localizacion: listingLocation(
      { address: development.address, coordinates: unit.coordinates ?? development.coordinates },
      locationId,
    ),
    precios: listingPrices({
      kind: 'property',
      listingId: unit.propertyId,
      source: unit,
      operation: undefined,
      listingType: 'simple',
      plan: undefined,
    }),
    caracteristicas: listingCharacteristics(unit),
    multimedia: listingImages(unit.photos),
    claveReferencia: unit.code,
  };
}

/** El cuerpo del `PUT /v1/inmobiliarias/{codigo}/desarrollos/{codigoAviso}`: siempre completo. */
export function developmentBody(
  content: DevelopmentListingContent,
  context: { readonly agencyCode: string; readonly locationId: string },
) {
  const { source } = content;
  return {
    codigoAviso: listingCode(content.listingId),
    publicador: listingPublisher(source.contact, context.agencyCode),
    publicacion: { tipoDePublicacion: content.plan },
    titulo: source.title.slice(0, DEVELOPMENT_TITLE_MAX),
    descripcion: source.description,
    tipoDePropiedad: {
      idTipo: source.kind === undefined ? undefined : DEVELOPMENT_TYPE_IDS[source.kind],
    },
    localizacion: listingLocation(source, context.locationId),
    ...(source.stage === undefined ? {} : { etapaDesarrollo: DEVELOPMENT_STAGES[source.stage] }),
    ...(source.deliveryDate === undefined
      ? {}
      : { fechaEntrega: deliveryMonth(source.deliveryDate) }),
    multimedia: listingImages(source.photos),
    // La clave con la que Norde identifica el emprendimiento en el panel de Zonaprop.
    claveReferencia: source.code,
    unidades: source.units.map((unit) => unitBody(unit, source, context.locationId)),
  };
}
