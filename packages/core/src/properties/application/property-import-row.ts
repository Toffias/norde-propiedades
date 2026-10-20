import { err, ok, type Result } from '../../shared';
import type { Coordinates } from '../domain/coordinates';
import { cleanReferenceCode, type OperationInput } from '../domain/property';
import type { PropertyKind } from '../domain/property-catalog';
import {
  EMPTY_CHARACTERISTICS,
  validateCharacteristics,
  type PropertyCharacteristics,
} from '../domain/property-details';
import type {
  PropertyImportColumns,
  PropertyImportField,
  PropertyImportProblemCode,
} from '../domain/property-import';
import {
  tokkoAddress,
  tokkoCount,
  tokkoDevelopmentName,
  tokkoExpensesCents,
  tokkoInternalComments,
  tokkoMeasure,
  tokkoPlace,
  tokkoPrice,
  tokkoPropertyKind,
  tokkoReferenceCode,
  type TokkoAddress,
  type TokkoPlace,
} from '../domain/tokko-property';

export interface RowProblem {
  readonly code: PropertyImportProblemCode;
  readonly field: PropertyImportField | undefined;
}

/** Un propietario que trae la fila, para buscarlo o crearlo en contactos. */
export interface ImportedOwner {
  readonly name: string;
  readonly phone: string | undefined;
  readonly email: string | undefined;
}

/** Una propiedad de Tokko (una fila de la exportación o de la API), lista para crearla. */
export interface ImportedProperty {
  readonly code: string;
  readonly kind: PropertyKind;
  readonly address: TokkoAddress;
  readonly place: TokkoPlace;
  readonly producerName: string | undefined;
  readonly operations: readonly [OperationInput, ...OperationInput[]];
  readonly characteristics: PropertyCharacteristics;
  readonly expensesCents: bigint | undefined;
  readonly internalComments: string | undefined;
  readonly owners: readonly ImportedOwner[];
  readonly developmentName: string | undefined;
  /** Solo desde la API: la exportación no los trae. */
  readonly portalTitle: string | undefined;
  readonly description: string | undefined;
  readonly coordinates: Coordinates | undefined;
  /** Lo que se ajustó para poder importarla (queda como aviso en el reporte). */
  readonly warnings: readonly RowProblem[];
}

const problem = (code: PropertyImportProblemCode, field?: PropertyImportField): RowProblem => ({
  code,
  field,
});

/** Lo que Tokko pone en una celda sin dato. */
const EMPTY = /^(-+|---)$/;

const OPERATIONS = [
  ['sale', 'salePrice'],
  ['rent', 'rentPrice'],
  ['temporary_rent', 'temporaryRentPrice'],
] as const;

const MEASURES = [
  ['surfaceTotalM2', 'surfaceTotal'],
  ['surfaceLandM2', 'surfaceLand'],
  ['surfaceCoveredM2', 'surfaceCovered'],
  ['surfaceSemiCoveredM2', 'surfaceSemiCovered'],
  ['frontM', 'front'],
  ['depthM', 'depth'],
] as const;

const COUNTS = [
  ['rooms', 'rooms'],
  ['bedrooms', 'bedrooms'],
  ['bathrooms', 'bathrooms'],
  ['toilets', 'toilets'],
  ['parkingSpaces', 'parkingSpaces'],
  ['ageYears', 'age'],
] as const;

/** Una fila de la exportación de Tokko, con las columnas de su encabezado. */
export function readPropertyImportRow(
  cells: readonly (string | undefined)[],
  columns: PropertyImportColumns,
): Result<ImportedProperty, RowProblem> {
  return readTokkoValues((field) => {
    const column = columns[field];
    return column === undefined ? undefined : cells[column];
  });
}

/**
 * Una propiedad de Tokko a partir de sus datos como los escribe la exportación (una celda por
 * dato). La API también pasa por acá, para que las reglas sean las mismas.
 */
export function readTokkoValues(
  raw: (field: PropertyImportField) => string | undefined,
): Result<ImportedProperty, RowProblem> {
  const value = (field: PropertyImportField): string | undefined => {
    const text = raw(field)?.trim();
    return text === undefined || text === '' || EMPTY.test(text) ? undefined : text;
  };

  const code = cleanReferenceCode(tokkoReferenceCode(value('code') ?? ''));
  if (code === undefined) return err(problem('invalid_code', 'code'));
  const rawAddress = value('address');
  if (rawAddress === undefined) return err(problem('missing_address', 'address'));
  const kind = tokkoPropertyKind(value('propertyType') ?? '');
  if (kind === undefined) return err(problem('unknown_type', 'propertyType'));

  const operations: OperationInput[] = [];
  for (const [operation, field] of OPERATIONS) {
    const price = tokkoPrice(value(field));
    if (price === null) return err(problem('invalid_value', field));
    if (price) operations.push({ operation, currency: price.currency, priceCents: price.cents });
  }
  const [first, ...others] = operations;
  if (first === undefined) return err(problem('missing_operation', 'salePrice'));

  const characteristics: Record<string, number | undefined> = {};
  for (const [target, field] of MEASURES) {
    const measure = tokkoMeasure(value(field));
    if (measure === null) return err(problem('invalid_value', field));
    characteristics[target] = measure;
  }
  for (const [target, field] of COUNTS) {
    const count = tokkoCount(value(field));
    if (count === null) return err(problem('invalid_value', field));
    characteristics[target] = count;
  }
  const warnings: RowProblem[] = [];
  let valid = validateCharacteristics({ ...EMPTY_CHARACTERISTICS, ...characteristics });
  // Tokko redondea: la total puede quedar unos centímetros debajo de la cubierta más la
  // semicubierta. Se importa sin la total, con un aviso.
  if (valid.isErr() && valid.error.type === 'CoveredExceedsTotal') {
    valid = validateCharacteristics({
      ...EMPTY_CHARACTERISTICS,
      ...characteristics,
      surfaceTotalM2: undefined,
    });
    if (valid.isOk()) warnings.push(problem('total_surface_dropped', 'surfaceTotal'));
  }
  if (valid.isErr()) return err(problem('invalid_value', 'surfaceCovered'));

  const expensesCents = tokkoExpensesCents(value('expenses'));
  if (expensesCents === null) return err(problem('invalid_value', 'expenses'));
  const uncovered = tokkoMeasure(value('surfaceUncovered'));
  if (uncovered === null) return err(problem('invalid_value', 'surfaceUncovered'));

  const ownerName = value('ownerName');
  const ownerPhone = value('ownerPhone');
  const ownerEmail = value('ownerEmail');
  const producer = value('producer');

  return ok({
    code,
    kind,
    address: tokkoAddress(rawAddress),
    place: tokkoPlace(value('country') ?? '', value('region') ?? '', value('neighborhood') ?? ''),
    // "Libre" es una propiedad sin productor en Tokko.
    producerName: producer === undefined || /^libre$/i.test(producer) ? undefined : producer,
    operations: [first, ...others],
    characteristics: valid.value,
    expensesCents,
    internalComments: tokkoInternalComments({
      floors: value('floors'),
      occupation: value('occupation'),
      zoning: value('zoning'),
      uncoveredM2: uncovered,
    }),
    owners:
      ownerName === undefined && ownerPhone === undefined && ownerEmail === undefined
        ? []
        : [{ name: ownerName ?? '', phone: ownerPhone, email: ownerEmail }],
    developmentName: tokkoDevelopmentName(value('development')),
    portalTitle: undefined,
    description: undefined,
    coordinates: undefined,
    warnings,
  });
}
