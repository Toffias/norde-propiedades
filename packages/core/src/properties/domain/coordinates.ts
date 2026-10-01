import { err, ok, type Result } from '../../shared/domain/result';

export interface InvalidCoordinatesError {
  readonly type: 'InvalidCoordinates';
}

/** Escala de las columnas `numeric(9,6)`: unos 10 cm, más que suficiente para un pin. */
const DECIMALS = 6;

function round(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Latitud y longitud en grados (WGS 84), redondeadas a 6 decimales. */
export class Coordinates {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static create(latitude: number, longitude: number): Result<Coordinates, InvalidCoordinatesError> {
    const valid =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180;
    if (!valid) return err({ type: 'InvalidCoordinates' });
    return ok(new Coordinates(round(latitude), round(longitude)));
  }
}
