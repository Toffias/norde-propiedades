import { err, ok, type Result } from '../../shared/domain/result';

import { PROPERTY_KINDS, type PropertyKind } from './property-catalog';

/** Grupos de atributos de la ficha, en el orden en que se muestran. */
export const PROPERTY_ATTRIBUTE_GROUPS = ['general', 'surfaces', 'operation', 'catalogs'] as const;
export type PropertyAttributeGroup = (typeof PROPERTY_ATTRIBUTE_GROUPS)[number];

/** Atributos estándar de una propiedad: cada uno es una columna tipada (ADR 0014). */
export const PROPERTY_ATTRIBUTE_KEYS = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'toilets',
  'parkingSpaces',
  'ageYears',
  'orientation',
  'condition',
  'disposition',
  'isFurnished',
  'professionalUse',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'surfaceSemiCoveredM2',
  'surfaceLandM2',
  'frontM',
  'depthM',
  'expenses',
  'creditEligible',
  'isExclusive',
  'acceptsSwap',
  'immediateDeed',
  'hasFinancing',
  'services',
  'roomFeatures',
  'amenities',
] as const;
export type PropertyAttribute = (typeof PROPERTY_ATTRIBUTE_KEYS)[number];

/**
 * Grupo de cada atributo en la ficha. Los catálogos de servicios, ambientes y adicionales se
 * habilitan como un atributo cada uno.
 */
export const PROPERTY_ATTRIBUTE_GROUP: Readonly<Record<PropertyAttribute, PropertyAttributeGroup>> =
  {
    rooms: 'general',
    bedrooms: 'general',
    bathrooms: 'general',
    toilets: 'general',
    parkingSpaces: 'general',
    ageYears: 'general',
    orientation: 'general',
    condition: 'general',
    disposition: 'general',
    isFurnished: 'general',
    professionalUse: 'general',
    surfaceTotalM2: 'surfaces',
    surfaceCoveredM2: 'surfaces',
    surfaceSemiCoveredM2: 'surfaces',
    surfaceLandM2: 'surfaces',
    frontM: 'surfaces',
    depthM: 'surfaces',
    expenses: 'operation',
    creditEligible: 'operation',
    isExclusive: 'operation',
    acceptsSwap: 'operation',
    immediateDeed: 'operation',
    hasFinancing: 'operation',
    services: 'catalogs',
    roomFeatures: 'catalogs',
    amenities: 'catalogs',
  };

const ALL = PROPERTY_ATTRIBUTE_KEYS;
const BUILDING: readonly PropertyAttribute[] = ALL.filter(
  (key) => key !== 'surfaceLandM2' && key !== 'frontM' && key !== 'depthM',
);
const LAND: readonly PropertyAttribute[] = [
  'surfaceTotalM2',
  'surfaceLandM2',
  'frontM',
  'depthM',
  'expenses',
  'creditEligible',
  'isExclusive',
  'acceptsSwap',
  'immediateDeed',
  'hasFinancing',
  'services',
];
const GARAGE: readonly PropertyAttribute[] = [
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'ageYears',
  'expenses',
  'isExclusive',
  'acceptsSwap',
  'immediateDeed',
  'hasFinancing',
  'services',
];

/**
 * Configuración recomendada: qué atributos muestra la ficha de cada tipo si nadie la cambió. Un
 * terreno no tiene dormitorios; una casa sí tiene terreno, frente y fondo.
 */
export const RECOMMENDED_ATTRIBUTES: Readonly<Record<PropertyKind, readonly PropertyAttribute[]>> =
  {
    apartment: BUILDING,
    house: ALL,
    ph: ALL,
    land: LAND,
    office: BUILDING.filter((key) => key !== 'bedrooms'),
    commercial: ALL.filter((key) => key !== 'bedrooms'),
    garage: GARAGE,
    warehouse: ALL.filter((key) => key !== 'bedrooms'),
  };

export interface PropertyTypeSetting {
  readonly kind: PropertyKind;
  readonly isEnabled: boolean;
  /** En el orden de `PROPERTY_ATTRIBUTE_KEYS`, sin repetidos. */
  readonly visibleAttributes: readonly PropertyAttribute[];
}

export interface NoPropertyTypeEnabledError {
  readonly type: 'NoPropertyTypeEnabled';
}
export interface PropertyTypeDisabledError {
  readonly type: 'PropertyTypeDisabled';
}

/** Un tipo sin configuración guardada: habilitado y con la configuración recomendada. */
export function defaultTypeSetting(kind: PropertyKind): PropertyTypeSetting {
  return { kind, isEnabled: true, visibleAttributes: RECOMMENDED_ATTRIBUTES[kind] };
}

/** Los atributos en el orden canónico y sin repetidos. */
export function normalizeAttributes(
  attributes: readonly PropertyAttribute[],
): readonly PropertyAttribute[] {
  const chosen = new Set(attributes);
  return PROPERTY_ATTRIBUTE_KEYS.filter((key) => chosen.has(key));
}

/**
 * Aplica el cambio de un tipo sobre la configuración de todos. La inmobiliaria trabaja al menos
 * con un tipo: no se pueden deshabilitar todos.
 */
export function changeTypeSetting(
  current: readonly PropertyTypeSetting[],
  change: PropertyTypeSetting,
): Result<PropertyTypeSetting, NoPropertyTypeEnabledError> {
  const next: PropertyTypeSetting = {
    ...change,
    visibleAttributes: normalizeAttributes(change.visibleAttributes),
  };
  const enabled = PROPERTY_KINDS.filter((kind) => {
    if (kind === change.kind) return next.isEnabled;
    return current.find((setting) => setting.kind === kind)?.isEnabled ?? true;
  });
  if (enabled.length === 0) return err({ type: 'NoPropertyTypeEnabled' });
  return ok(next);
}

/** Solo se dan de alta propiedades de los tipos con los que trabaja la inmobiliaria. */
export function ensureTypeEnabled(
  setting: PropertyTypeSetting,
): Result<void, PropertyTypeDisabledError> {
  return setting.isEnabled ? ok(undefined) : err({ type: 'PropertyTypeDisabled' });
}
