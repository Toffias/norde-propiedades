import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdateDevelopmentLocationInputSchema,
  type GeocodingOutcome,
  type UpdateDevelopmentLocationInput,
} from '../../contracts';
import type { InvalidCoordinatesError } from '../../domain/coordinates';
import type { DevelopmentInTrashError } from '../../domain/development';
import type { LocationNotFoundError } from '../catalog-support';
import {
  canEditDevelopments,
  findDevelopment,
  locateDevelopment,
  manualCoordinates,
  resolveDevelopmentPlace,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { Geocoder } from '../ports/geocoder';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UpdateDevelopmentLocationError =
  EditDevelopmentError | DevelopmentInTrashError | InvalidCoordinatesError | LocationNotFoundError;

export interface UpdateDevelopmentLocationOutput {
  /** Si las coordenadas se cargaron a mano, se buscaron de nuevo, o quedaron como estaban. */
  readonly geocoding: GeocodingOutcome | 'unchanged';
}

/**
 * Dirección privada, dirección para publicar, ubicación y coordenadas. Si cambió la dirección o la
 * ubicación y no vinieron coordenadas, se vuelven a buscar; si no se encuentran, quedan las que
 * había. Las unidades ya creadas conservan la suya.
 */
export class UpdateDevelopmentLocation {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly geocoder: Geocoder;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdateDevelopmentLocationInput,
    actor: Actor,
  ): Promise<Result<UpdateDevelopmentLocationOutput, UpdateDevelopmentLocationError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateDevelopmentLocationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const manual = manualCoordinates(data);
    if (manual.isErr()) return err(manual.error);
    let coordinates = manual.value;

    const resolved = await this.deps.uow.run(async (tx) => ({
      place: await resolveDevelopmentPlace(tx, data.locationId),
      current: (await findDevelopment(tx.developments, data.developmentId))?.toSnapshot(),
    }));
    if (resolved.place.isErr()) return err(resolved.place.error);

    let geocoding: UpdateDevelopmentLocationOutput['geocoding'] = 'manual';
    if (coordinates === undefined) {
      const current = resolved.current;
      coordinates = current?.coordinates;
      geocoding = 'unchanged';
      const moved =
        current !== undefined &&
        (current.privateAddress !== data.privateAddress.trim() ||
          current.locationId !== data.locationId);
      if (moved) {
        const located = await locateDevelopment(
          this.deps.geocoder,
          data.privateAddress,
          resolved.place.value,
        );
        geocoding = located.outcome;
        coordinates = located.coordinates ?? coordinates;
      }
    }
    const now = this.deps.clock.now();

    const edited = await runDevelopmentEdit(this.deps.uow, actor, data.developmentId, {
      apply: (development) =>
        development.updateLocation(
          {
            privateAddress: data.privateAddress,
            publishAddress: data.publishAddress,
            locationId: data.locationId,
            coordinates,
          },
          now,
        ),
    });
    return edited.isErr() ? err(edited.error) : ok({ geocoding });
  }
}
