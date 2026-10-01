import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  CreatePropertyInputSchema,
  type CreatePropertyInput,
  type CreatePropertyValues,
  type GeocodingOutcome,
} from '../../contracts';
import { Coordinates, type InvalidCoordinatesError } from '../../domain/coordinates';
import type { Location } from '../../domain/location';
import { Property, type NegativePriceError, type PropertyAddress } from '../../domain/property';
import {
  ensureTypeEnabled,
  type PropertyTypeDisabledError,
} from '../../domain/property-type-settings';
import { idOf, type LocationNotFoundError } from '../catalog-support';
import type { Geocoder } from '../ports/geocoder';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from '../ports/reference-code-allocator';
import { propertyAuditState, propertyTarget, type InvalidInputError } from '../property-support';

export type CreatePropertyError =
  | ForbiddenError
  | InvalidInputError
  | InvalidCoordinatesError
  | NegativePriceError
  | LocationNotFoundError
  | PropertyTypeDisabledError
  | ReferenceCodeUnavailableError;

export interface CreatePropertyOutput {
  readonly propertyId: string;
  readonly code: string;
  /** Si las coordenadas se cargaron a mano, se encontraron, o quedaron para completar en la ficha. */
  readonly geocoding: GeocodingOutcome;
}

interface Place {
  readonly locationId: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
}

/** Barrio, localidad y provincia: los niveles de la ubicación elegida y de sus ancestros. */
function placeFromLineage(locationId: string, lineage: readonly Location[]): Place {
  const named = (kinds: readonly string[]) =>
    [...lineage].reverse().find((location) => kinds.includes(location.toSnapshot().kind))?.name ??
    '';
  return {
    locationId,
    neighborhood: named(['subneighborhood', 'neighborhood']),
    city: named(['city']),
    province: named(['province']),
  };
}

/**
 * Alta corta de una propiedad: tipo, operación, dirección y ubicación. Queda como borrador, con
 * quien la carga como captador y su sucursal. El resto se completa en la ficha.
 *
 * Sin coordenadas, se buscan con el geocodificador. Si no las encuentra o el servicio falla, la
 * propiedad se crea igual y el resultado lo dice, para completarlas en la ficha.
 */
export class CreateProperty {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly codes: ReferenceCodeAllocator;
      readonly geocoder: Geocoder;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreatePropertyInput,
    actor: Actor,
  ): Promise<Result<CreatePropertyOutput, CreatePropertyError>> {
    if (!actor.can('properties:create')) return err({ type: 'Forbidden' });

    const parsed = CreatePropertyInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const data = parsed.data;

    let coordinates: Coordinates | undefined;
    if (data.latitude !== undefined && data.longitude !== undefined) {
      const valid = Coordinates.create(data.latitude, data.longitude);
      if (valid.isErr()) return err(valid.error);
      coordinates = valid.value;
    }

    const place = await this.deps.uow.run((tx) => resolvePlace(tx, data));
    if (place.isErr()) return err(place.error);
    const { locationId, ...texts } = place.value;
    const address: PropertyAddress = {
      street: data.street,
      streetNumber: data.streetNumber,
      floor: data.floor,
      unit: data.unit,
      ...texts,
    };

    // Fuera de la transacción: es una llamada a un servicio externo.
    let geocoding: GeocodingOutcome = 'manual';
    if (coordinates === undefined) {
      const located = await this.deps.geocoder.locate(address);
      const valid =
        located.isOk() && located.value !== undefined
          ? Coordinates.create(located.value.latitude, located.value.longitude)
          : undefined;
      coordinates = valid?.isOk() ? valid.value : undefined;
      geocoding = located.isErr() ? 'failed' : coordinates === undefined ? 'not_found' : 'found';
    }

    // Un actor de sistema (una importación) no capta: la propiedad queda sin captador.
    const producerUserId = actor.kind === 'user' ? actor.id : undefined;
    const code = await this.deps.codes.allocate(
      { kind: data.propertyType, producerUserId, branchId: actor.branchId },
      actor,
    );
    if (code.isErr()) return err(code.error);

    const created = Property.create({
      id: nextId<'Property'>(this.deps.ids),
      code: code.value,
      kind: data.propertyType,
      operation: { operation: data.operation, currency: data.currency, priceCents: data.price },
      address,
      publishAddress: data.publishAddress,
      portalTitle: data.portalTitle,
      coordinates,
      locationId,
      producerUserId,
      branchId: actor.branchId,
      now: this.deps.clock.now(),
    });
    if (created.isErr()) return err(created.error);
    const property = created.value;

    return this.deps.uow.run(
      async (tx): Promise<Result<CreatePropertyOutput, CreatePropertyError>> => {
        await tx.properties.save(property, actor.id);
        await tx.events.publish(property.pullEvents());
        await tx.audit.record(
          auditCreated(
            actor,
            propertyTarget('property.created', property.id),
            propertyAuditState(property),
          ),
        );
        return ok({ propertyId: property.id, code: property.code, geocoding });
      },
    );
  }
}

/** El tipo tiene que estar habilitado; la ubicación sale del catálogo o de los textos. */
async function resolvePlace(
  tx: PropertiesTransaction,
  data: CreatePropertyValues,
): Promise<Result<Place, LocationNotFoundError | PropertyTypeDisabledError>> {
  const enabled = ensureTypeEnabled(await tx.typeSettings.find(data.propertyType));
  if (enabled.isErr()) return err(enabled.error);

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
