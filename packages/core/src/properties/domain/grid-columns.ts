import { err, ok, type Result } from '../../shared/domain/result';

/**
 * Columnas que se pueden sumar a la grilla del buscador, además de las fijas (código, propiedad,
 * operación y precio, estado). Son de toda la inmobiliaria, como en Tokko.
 */
export const GRID_COLUMN_OPTIONS = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'parkingSpaces',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'ageYears',
  'producer',
  'createdAt',
  'updatedAt',
] as const;
export type GridColumn = (typeof GRID_COLUMN_OPTIONS)[number];

/** Más columnas no entran en una pantalla de notebook sin scroll horizontal. */
export const MAX_GRID_COLUMNS = 4;

/** Las columnas de la grilla hasta que alguien las cambie en Mi empresa. */
export const DEFAULT_GRID_COLUMNS: readonly GridColumn[] = [
  'rooms',
  'surfaceTotalM2',
  'producer',
  'updatedAt',
];

export interface TooManyGridColumnsError {
  readonly type: 'TooManyGridColumns';
  readonly max: number;
}

/** Sin repetidos, en el orden elegido y como mucho `MAX_GRID_COLUMNS`. */
export function chooseGridColumns(
  columns: readonly GridColumn[],
): Result<readonly GridColumn[], TooManyGridColumnsError> {
  const unique = [...new Set(columns)];
  if (unique.length > MAX_GRID_COLUMNS) {
    return err({ type: 'TooManyGridColumns', max: MAX_GRID_COLUMNS });
  }
  return ok(unique);
}
