import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyLocationInputSchema,
  type GeocodingOutcome,
  type UpdatePropertyLocationInput,
} from '../../contracts';
import { Coordinates, type InvalidCoordinatesError } from '../../domain/coordinates';
import type { PropertyAddress, PropertyInTrashError } from '../../domain/property';
import { idOf, placeFromLineage, type LocationNotFoundError, type Place } from '../catalog-support';
import type { Geocoder } from '../ports/geocoder';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  findProperty,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyLocationError =
  EditPropertyError | PropertyInTrashError | InvalidCoordinatesError | LocationNotFoundError;

export interface UpdatePropertyLocationOutput {
  /** Si las coordenadas se cargaron a mano, se buscaron de nuevo, o quedaron como estaban. */
  readonly geocoding: GeocodingOutcome | 'unchanged';
}

function sameStreet(a: PropertyAddress, b: PropertyAddress): boolean {
  return (
    a.street === b.street &&
    a.streetNumber === b.streetNumber &&
    a.neighborhood === b.neighborhood &&
    a.city === b.city &&
    a.province === b.province
  );
}

/**
 * Dirección real, dirección para publicar, ubicación del catálogo y coordenadas. Si cambió la
 * dirección y no vinieron coordenadas, se vuelven a buscar con el geocodificador; si no las
 * encuentra, quedan las que había.
 */
export class UpdatePropertyLocation {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly geocoder: Geocoder;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdatePropertyLocationInput,
    actor: Actor,
  ): Promise<Result<UpdatePropertyLocationOutput, UpdatePropertyLocationError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyLocationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    let coordinates: Coordinates | undefined;
    if (data.latitude !== undefined && data.longitude !== undefined) {
      const valid = Coordinates.create(data.latitude, data.longitude);
      if (valid.isErr()) return err(valid.error);
      coordinates = valid.value;
    }

    const resolved = await this.deps.uow.run(async (tx) => {
      const place = await resolvePlace(tx, data);
      const property = await findProperty(tx.properties, data.propertyId);
      return { place, current: property?.toSnapshot() };
    });
    if (resolved.place.isErr()) return err(resolved.place.error);
    const { locationId, ...texts } = resolved.place.value;
    const address: PropertyAddress = {
      street: data.street.trim(),
      streetNumber: data.streetNumber,
      floor: data.floor,
      unit: data.unit,
      ...texts,
    };

    // Fuera de la transacción: es una llamada a un servicio externo.
    let geocoding: UpdatePropertyLocationOutput['geocoding'] = 'manual';
    if (coordinates === undefined) {
      const current = resolved.current;
      coordinates = current?.coordinates;
      geocoding = 'unchanged';
      if (current !== undefined && !sameStreet(current.address, address)) {
        const located = await this.deps.geocoder.locate(address);
        const valid =
          located.isOk() && located.value !== undefined
            ? Coordinates.create(located.value.latitude, located.value.longitude)
            : undefined;
        if (valid?.isOk()) coordinates = valid.value;
        geocoding = located.isErr() ? 'failed' : valid?.isOk() ? 'found' : 'not_found';
      }
    }
    const now = this.deps.clock.now();

    const edited = await runPropertyEdit(this.deps.uow, actor, data.propertyId, {
      apply: (property) =>
        property.updateLocation(
          { address, publishAddress: data.publishAddress, locationId, coordinates },
          now,
        ),
    });
    return edited.isErr() ? err(edited.error) : ok({ geocoding });
  }
}

async function resolvePlace(
  tx: PropertiesTransaction,
  data: {
    readonly locationId?: string | undefined;
    readonly neighborhood?: string | undefined;
    readonly city?: string | undefined;
    readonly province?: string | undefined;
  },
): Promise<Result<Place, LocationNotFoundError>> {
  if (data.locationId === undefined) {
    return ok({
      locationId: undefined,
      neighborhood: data.neighborhood ?? '',
      city: data.city ?? '',
      province: data.province ?? '',
    });
  }
  const id = idOf<'Location'>(data.locationId);
  const lineage = id === undefined ? [] : await tx.locations.findLineage(id);
  if (lineage.length === 0) return err({ type: 'LocationNotFound' });
  return ok(placeFromLineage(id ?? data.locationId, lineage));
}
