import { err, ok, type Result } from '../../shared';
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
  type TokkoAddress,
  type TokkoPlace,
} from '../domain/tokko-property';

export interface RowProblem {
  readonly code: PropertyImportProblemCode;
  readonly field: PropertyImportField | undefined;
}

/** Una fila de la exportación de Tokko, lista para crear la propiedad. */
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
  readonly owner:
    | {
        readonly name: string;
        readonly phone: string | undefined;
        readonly email: string | undefined;
      }
    | undefined;
  readonly developmentName: string | undefined;
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
  const value = (field: PropertyImportField): string | undefined => {
    const column = columns[field];
    const raw = column === undefined ? undefined : cells[column]?.trim();
    return raw === undefined || raw === '' || EMPTY.test(raw) ? undefined : raw;
  };

  const code = cleanReferenceCode(value('code') ?? '');
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
  const valid = validateCharacteristics({ ...EMPTY_CHARACTERISTICS, ...characteristics });
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
    owner:
      ownerName === undefined && ownerPhone === undefined && ownerEmail === undefined
        ? undefined
        : { name: ownerName ?? '', phone: ownerPhone, email: ownerEmail },
    developmentName: tokkoDevelopmentName(value('development')),
  });
}
