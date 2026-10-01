import { err, ok, type Result } from '../../shared/domain/result';

// Lo que se completa en la ficha después del alta: características, condiciones de la operación,
// información interna, publicación y atributos personalizados.

export const ORIENTATIONS = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const CONDITIONS = [
  'brand_new',
  'excellent',
  'very_good',
  'good',
  'fair',
  'to_renovate',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Frente, contrafrente, interno o lateral. */
export const DISPOSITIONS = ['front', 'back', 'internal', 'lateral'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface PropertyCharacteristics {
  readonly rooms: number | undefined;
  readonly bedrooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly toilets: number | undefined;
  readonly parkingSpaces: number | undefined;
  readonly ageYears: number | undefined;
  readonly orientation: Orientation | undefined;
  readonly condition: Condition | undefined;
  readonly disposition: Disposition | undefined;
  readonly isFurnished: boolean;
  readonly professionalUse: boolean;
  /** Metros cuadrados, con hasta dos decimales. */
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
  readonly surfaceSemiCoveredM2: number | undefined;
  readonly surfaceLandM2: number | undefined;
  readonly frontM: number | undefined;
  readonly depthM: number | undefined;
}

export const EMPTY_CHARACTERISTICS: PropertyCharacteristics = {
  rooms: undefined,
  bedrooms: undefined,
  bathrooms: undefined,
  toilets: undefined,
  parkingSpaces: undefined,
  ageYears: undefined,
  orientation: undefined,
  condition: undefined,
  disposition: undefined,
  isFurnished: false,
  professionalUse: false,
  surfaceTotalM2: undefined,
  surfaceCoveredM2: undefined,
  surfaceSemiCoveredM2: undefined,
  surfaceLandM2: undefined,
  frontM: undefined,
  depthM: undefined,
};

/** Condiciones comerciales de la propiedad, comunes a todas sus operaciones. */
export interface DealAttributes {
  readonly isExclusive: boolean;
  readonly acceptsSwap: boolean;
  readonly immediateDeed: boolean;
  readonly hasFinancing: boolean;
  readonly creditEligible: boolean;
  /** Expensas mensuales, en centavos de pesos. */
  readonly expensesCents: bigint | undefined;
}

export const EMPTY_DEAL_ATTRIBUTES: DealAttributes = {
  isExclusive: false,
  acceptsSwap: false,
  immediateDeed: false,
  hasFinancing: false,
  creditEligible: false,
  expensesCents: undefined,
};

/** Lo que solo ve el equipo. Usuarios por ID (identity). */
export interface InternalInfo {
  readonly maintenanceUserId: string | undefined;
  readonly appraiserUserIds: readonly string[];
  readonly keysLocation: string | undefined;
  readonly legalInfo: string | undefined;
  readonly internalComments: string | undefined;
}

export const EMPTY_INTERNAL_INFO: InternalInfo = {
  maintenanceUserId: undefined,
  appraiserUserIds: [],
  keysLocation: undefined,
  legalInfo: undefined,
  internalComments: undefined,
};

/** Cómo se muestra en la web y los portales. */
export interface Publication {
  readonly publishedOnWeb: boolean;
  /** Sin precio: la web muestra "consultar precio". */
  readonly showPriceOnWeb: boolean;
  readonly featured: boolean;
  readonly showExactAddress: boolean;
}

export const DEFAULT_PUBLICATION: Publication = {
  publishedOnWeb: false,
  showPriceOnWeb: true,
  featured: false,
  showExactAddress: false,
};

/** Valor de un atributo personalizado (ADR 0014), en el tipo de su definición. */
export type CustomAttributeValue = string | number | boolean;

export interface CustomAttributeEntry {
  readonly attributeId: string;
  readonly value: CustomAttributeValue;
}

export const CUSTOM_ATTRIBUTE_KINDS = ['text', 'number', 'boolean', 'select'] as const;
export type CustomAttributeKind = (typeof CUSTOM_ATTRIBUTE_KINDS)[number];

/** Definición de un atributo personalizado, tal como la necesita la validación del valor. */
export interface CustomAttributeDefinition {
  readonly id: string;
  readonly kind: CustomAttributeKind;
  readonly options: readonly string[];
  readonly isActive: boolean;
}

export interface NegativeCharacteristicError {
  readonly type: 'NegativeCharacteristic';
  readonly field: string;
}
/** La superficie cubierta (más la semicubierta) no puede superar la total. */
export interface CoveredExceedsTotalError {
  readonly type: 'CoveredExceedsTotal';
}
export interface InvalidCustomAttributeValueError {
  readonly type: 'InvalidCustomAttributeValue';
  readonly attributeId: string;
}
export interface CustomAttributeNotFoundError {
  readonly type: 'CustomAttributeNotFound';
  readonly attributeId: string;
}

const NUMERIC_FIELDS = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'toilets',
  'parkingSpaces',
  'ageYears',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'surfaceSemiCoveredM2',
  'surfaceLandM2',
  'frontM',
  'depthM',
] as const satisfies readonly (keyof PropertyCharacteristics)[];

/** Ningún valor negativo, y lo cubierto entra en la superficie total. */
export function validateCharacteristics(
  value: PropertyCharacteristics,
): Result<PropertyCharacteristics, NegativeCharacteristicError | CoveredExceedsTotalError> {
  for (const field of NUMERIC_FIELDS) {
    const number = value[field];
    if (number !== undefined && number < 0) return err({ type: 'NegativeCharacteristic', field });
  }
  const { surfaceTotalM2, surfaceCoveredM2, surfaceSemiCoveredM2 } = value;
  if (surfaceTotalM2 !== undefined && surfaceCoveredM2 !== undefined) {
    // Comparación en centésimos: los metros llegan con dos decimales.
    const built = Math.round((surfaceCoveredM2 + (surfaceSemiCoveredM2 ?? 0)) * 100);
    if (built > Math.round(surfaceTotalM2 * 100)) return err({ type: 'CoveredExceedsTotal' });
  }
  return ok(value);
}

/**
 * Valida cada valor contra su definición: que exista y esté activa, y que el valor sea de su tipo
 * (una opción de la lista en un `select`). Los vacíos no se guardan.
 */
export function validateCustomAttributes(
  entries: readonly CustomAttributeEntry[],
  definitions: readonly CustomAttributeDefinition[],
): Result<
  readonly CustomAttributeEntry[],
  CustomAttributeNotFoundError | InvalidCustomAttributeValueError
> {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const clean: CustomAttributeEntry[] = [];
  for (const entry of entries) {
    const definition = byId.get(entry.attributeId);
    if (!definition?.isActive) {
      return err({ type: 'CustomAttributeNotFound', attributeId: entry.attributeId });
    }
    const value = typeof entry.value === 'string' ? entry.value.trim() : entry.value;
    if (value === '') continue;
    const valid =
      (definition.kind === 'text' && typeof value === 'string') ||
      (definition.kind === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (definition.kind === 'boolean' && typeof value === 'boolean') ||
      (definition.kind === 'select' &&
        typeof value === 'string' &&
        definition.options.includes(value));
    if (!valid) return err({ type: 'InvalidCustomAttributeValue', attributeId: entry.attributeId });
    clean.push({ attributeId: entry.attributeId, value });
  }
  return ok(clean);
}

/** Texto opcional: vacío o solo espacios queda sin valor. */
export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}
