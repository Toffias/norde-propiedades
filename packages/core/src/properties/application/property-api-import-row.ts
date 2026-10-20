import { err, ok, type Result } from '../../shared';
import { MAX_DESCRIPTION_LENGTH } from '../contracts';
import { Coordinates } from '../domain/coordinates';
import { MAX_MEDIA_PER_OWNER } from '../domain/media-item';
import type { PropertyImportField } from '../domain/property-import';
import { tokkoApiPlace } from '../domain/tokko-property';

import type {
  TokkoApiOperation,
  TokkoApiPhoto,
  TokkoApiProperty,
} from './ports/tokko-property-source';
import { readTokkoValues, type ImportedProperty, type RowProblem } from './property-import-row';

/** Una propiedad de la API de Tokko, lista para crearla o para completar la que ya está. */
export interface ApiImportedProperty extends ImportedProperty {
  /** Los comentarios internos que cargaron en Tokko, para sumarlos a los de Norde. */
  readonly tokkoComments: string | undefined;
  /** En el orden de Tokko, como mucho las que entran en la galería. */
  readonly photos: readonly TokkoApiPhoto[];
}

/** El encabezado con el que los comentarios de Tokko se suman a los internos. */
export const TOKKO_COMMENTS_HEADING = 'Comentarios de Tokko';

/** El dato de la operación en la exportación: 1 venta, 2 alquiler, 3 alquiler temporario. */
const OPERATION_FIELDS: Readonly<Record<number, PropertyImportField>> = {
  1: 'salePrice',
  2: 'rentPrice',
  3: 'temporaryRentPrice',
};

/** El título para portales de Norde (como el formulario de la ficha). */
const MAX_PORTAL_TITLE_LENGTH = 120;

const CURRENCIES: Readonly<Record<string, string>> = { USD: 'USD', ARS: '$' };

/**
 * Los precios como los escribe la exportación ("USD 130000 | $ 9"); `null` si la moneda o el monto
 * no se entienden. Un monto en cero es "sin precio".
 */
function priceText(operation: TokkoApiOperation): string | null {
  const prices: string[] = [];
  for (const price of operation.prices) {
    const symbol = CURRENCIES[price.currency.trim().toUpperCase()];
    if (symbol === undefined || !Number.isFinite(price.amount) || price.amount < 0) return null;
    if (price.amount > 0) prices.push(`${symbol} ${String(Math.round(price.amount))}`);
  }
  return prices.join(' | ');
}

function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text === undefined || text === '' ? undefined : text;
}

const count = (value: number | undefined) => (value === undefined ? undefined : String(value));

/**
 * Una propiedad de la API de Tokko con las mismas reglas que una fila de la exportación (código,
 * tipo, operaciones, medidas, productor y emprendimiento), más lo que solo trae la API: la ubicación
 * con su partido, todos los propietarios, el título y la descripción, las coordenadas, los
 * comentarios internos y las fotos.
 */
export function readTokkoApiProperty(
  property: TokkoApiProperty,
): Result<ApiImportedProperty, RowProblem> {
  const prices: Partial<Record<PropertyImportField, string>> = {};
  for (const operation of property.operations) {
    const field = OPERATION_FIELDS[operation.operationId];
    const text = priceText(operation);
    if (field === undefined || text === null) {
      return err({ code: 'invalid_value', field: field ?? 'salePrice' });
    }
    prices[field] = text;
  }
  const [owner] = property.owners;
  const values: Partial<Record<PropertyImportField, string | undefined>> = {
    ...prices,
    code: property.referenceCode,
    address: property.address,
    propertyType: property.typeName,
    producer: property.producerName,
    surfaceTotal: property.surfaceTotal,
    surfaceLand: property.surfaceLand,
    surfaceCovered: property.surfaceCovered,
    surfaceSemiCovered: property.surfaceSemiCovered,
    surfaceUncovered: property.surfaceUncovered,
    front: property.front,
    depth: property.depth,
    rooms: count(property.rooms),
    bedrooms: count(property.bedrooms),
    bathrooms: count(property.bathrooms),
    toilets: count(property.toilets),
    parkingSpaces: count(property.parkingSpaces),
    age: count(property.age),
    expenses: property.expenses === undefined ? undefined : String(Math.round(property.expenses)),
    floors: count(property.floors),
    zoning: property.zoning,
    ownerName: owner?.name,
    development: property.developmentName,
  };
  const read = readTokkoValues((field) => values[field]);
  if (read.isErr()) return err(read.error);
  const row = read.value;

  const warnings: RowProblem[] = [...row.warnings];
  const fullDescription = optionalText(property.description);
  if (fullDescription !== undefined && fullDescription.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push({ code: 'description_truncated', field: undefined });
  }
  const latitude = property.latitude ?? 0;
  const longitude = property.longitude ?? 0;
  // Tokko guarda 0 cuando no ubicó la propiedad en el mapa.
  const coordinates =
    latitude === 0 && longitude === 0 ? undefined : Coordinates.create(latitude, longitude);
  const tokkoComments = optionalText(property.internalComments);

  return ok({
    ...row,
    address: {
      ...row.address,
      floor: row.address.floor ?? optionalText(property.floor),
      unit: row.address.unit ?? optionalText(property.unit),
    },
    place: tokkoApiPlace(property.fullLocation),
    operations: [
      { ...row.operations[0], priceOnRequest: !property.showPrice },
      ...row.operations.slice(1).map((o) => ({ ...o, priceOnRequest: !property.showPrice })),
    ],
    internalComments:
      [row.internalComments, tokkoComments && `${TOKKO_COMMENTS_HEADING}\n${tokkoComments}`]
        .filter((part): part is string => part !== undefined)
        .join('\n\n') || undefined,
    owners: property.owners.filter(
      (o) =>
        optionalText(o.name) !== undefined ||
        optionalText(o.phone) !== undefined ||
        optionalText(o.email) !== undefined,
    ),
    portalTitle: optionalText(property.title)?.slice(0, MAX_PORTAL_TITLE_LENGTH),
    description: fullDescription?.slice(0, MAX_DESCRIPTION_LENGTH),
    coordinates: coordinates?.isOk() === true ? coordinates.value : undefined,
    warnings,
    tokkoComments,
    photos: [...property.photos].sort((a, b) => a.order - b.order).slice(0, MAX_MEDIA_PER_OWNER),
  });
}
