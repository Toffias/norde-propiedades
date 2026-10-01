import type {
  GridColumnValue,
  PanelPropertyAttributes,
  PanelPropertyOperation,
  PanelPropertyRow,
  UserRef,
} from '@norde/core/properties/contracts';

import { EMPTY_VALUE, formatDateTime, formatMoney } from '../../lib/format';
import { OPERATION_LABELS } from './labels';

// Cómo se muestran los datos de una propiedad en la grilla, las tarjetas, el mapa y el comparador.

/** "Camila Ruiz", o un aviso si el usuario ya no está activo. */
export function userName(user: UserRef | undefined): string {
  if (user === undefined) return EMPTY_VALUE;
  return user.name ?? 'Usuario inactivo';
}

/** "US$ 120.000" o "Consultar". */
export function operationPrice(operation: PanelPropertyOperation): string {
  return operation.priceCents === null
    ? 'Consultar'
    : formatMoney({ amountCents: operation.priceCents, currency: operation.currency });
}

/** "Venta US$ 120.000 · Alquiler $ 850.000". */
export function operationsSummary(operations: readonly PanelPropertyOperation[]): string {
  if (operations.length === 0) return EMPTY_VALUE;
  return operations
    .map((operation) => `${OPERATION_LABELS[operation.operation]} ${operationPrice(operation)}`)
    .join(' · ');
}

/** "Gurruchaga al 1800, Palermo, CABA". */
export function placeSummary(row: PanelPropertyRow): string {
  return [row.publishAddress, row.neighborhood, row.city]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');
}

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function count(value: number | undefined): string {
  return value === undefined ? EMPTY_VALUE : numberFormat.format(value);
}

function area(value: number | undefined): string {
  return value === undefined ? EMPTY_VALUE : `${numberFormat.format(value)} m²`;
}

/** "3 amb. · 2 dorm. · 70 m²", con lo que esté cargado. */
export function attributesSummary(attributes: PanelPropertyAttributes): string {
  return [
    attributes.rooms === undefined ? undefined : `${attributes.rooms} amb.`,
    attributes.bedrooms === undefined ? undefined : `${attributes.bedrooms} dorm.`,
    attributes.bathrooms === undefined ? undefined : `${attributes.bathrooms} baños`,
    attributes.surfaceTotalM2 === undefined ? undefined : area(attributes.surfaceTotalM2),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

/** El valor de una columna configurable de la grilla. */
export function gridColumnValue(row: PanelPropertyRow, column: GridColumnValue): string {
  const a = row.attributes;
  switch (column) {
    case 'rooms':
      return count(a.rooms);
    case 'bedrooms':
      return count(a.bedrooms);
    case 'bathrooms':
      return count(a.bathrooms);
    case 'parkingSpaces':
      return count(a.parkingSpaces);
    case 'surfaceTotalM2':
      return area(a.surfaceTotalM2);
    case 'surfaceCoveredM2':
      return area(a.surfaceCoveredM2);
    case 'ageYears':
      return a.ageYears === undefined ? EMPTY_VALUE : `${a.ageYears} años`;
    case 'producer':
      return userName(row.producer);
    case 'createdAt':
      return formatDateTime(row.createdAt);
    case 'updatedAt':
      return formatDateTime(row.updatedAt);
  }
}

/** Filas del comparador: qué se compara y cómo se muestra. */
export const COMPARE_ROWS: readonly {
  readonly label: string;
  readonly value: (row: PanelPropertyRow) => string;
}[] = [
  { label: 'Operación y precio', value: (row) => operationsSummary(row.operations) },
  { label: 'Superficie total', value: (row) => area(row.attributes.surfaceTotalM2) },
  { label: 'Superficie cubierta', value: (row) => area(row.attributes.surfaceCoveredM2) },
  { label: 'Ambientes', value: (row) => count(row.attributes.rooms) },
  { label: 'Dormitorios', value: (row) => count(row.attributes.bedrooms) },
  { label: 'Baños', value: (row) => count(row.attributes.bathrooms) },
  { label: 'Cocheras', value: (row) => count(row.attributes.parkingSpaces) },
  {
    label: 'Antigüedad',
    value: (row) =>
      row.attributes.ageYears === undefined ? EMPTY_VALUE : `${row.attributes.ageYears} años`,
  },
  { label: 'Ubicación', value: (row) => [row.neighborhood, row.city, row.province].join(', ') },
];
