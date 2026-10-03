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
  CreateDevelopmentInputSchema,
  type CreateDevelopmentInput,
  type GeocodingOutcome,
} from '../../contracts';
import type { InvalidCoordinatesError } from '../../domain/coordinates';
import { Development } from '../../domain/development';
import type { LocationNotFoundError } from '../catalog-support';
import {
  developmentCreatedState,
  developmentTarget,
  locateDevelopment,
  manualCoordinates,
  resolveDevelopmentPlace,
} from '../development-support';
import type { DevelopmentCodeAllocator } from '../ports/development-code-allocator';
import type { Geocoder } from '../ports/geocoder';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { ReferenceCodeUnavailableError } from '../ports/reference-code-allocator';
import { invalidInput, type InvalidInputError } from '../property-support';

export type CreateDevelopmentError =
  | ForbiddenError
  | InvalidInputError
  | InvalidCoordinatesError
  | LocationNotFoundError
  | ReferenceCodeUnavailableError;

export interface CreateDevelopmentOutput {
  readonly developmentId: string;
  readonly code: string;
  readonly geocoding: GeocodingOutcome;
}

/**
 * Alta de un emprendimiento: nombre, tipo, dirección privada, ubicación, título para portales,
 * desarrollista y contacto comercial. Nace "cargando información", con quien lo carga como captador
 * y su sucursal. El resto se completa en la ficha.
 *
 * Sin coordenadas, se buscan con el geocodificador; si no las encuentra, el emprendimiento se crea
 * igual y el resultado lo dice.
 */
export class CreateDevelopment {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly codes: DevelopmentCodeAllocator;
      readonly geocoder: Geocoder;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateDevelopmentInput,
    actor: Actor,
  ): Promise<Result<CreateDevelopmentOutput, CreateDevelopmentError>> {
    if (!actor.can('developments:create')) return err({ type: 'Forbidden' });
    const parsed = CreateDevelopmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const manual = manualCoordinates(data);
    if (manual.isErr()) return err(manual.error);
    let coordinates = manual.value;

    const place = await this.deps.uow.run((tx) => resolveDevelopmentPlace(tx, data.locationId));
    if (place.isErr()) return err(place.error);

    let geocoding: GeocodingOutcome = 'manual';
    if (coordinates === undefined) {
      const located = await locateDevelopment(this.deps.geocoder, data.privateAddress, place.value);
      coordinates = located.coordinates;
      geocoding = located.outcome;
    }

    // Un actor de sistema (una importación) no capta: queda sin captador.
    const producerUserId = actor.kind === 'user' ? actor.id : undefined;
    const code = await this.deps.codes.allocate(
      { producerUserId, branchId: actor.branchId },
      actor,
    );
    if (code.isErr()) return err(code.error);

    const development = Development.create({
      id: nextId<'Development'>(this.deps.ids),
      code: code.value,
      name: data.name,
      kind: data.developmentType,
      privateAddress: data.privateAddress,
      publishAddress: data.publishAddress,
      portalTitle: data.portalTitle,
      developerName: data.developerName,
      commercialContactClientId: data.commercialContactClientId,
      locationId: data.locationId,
      coordinates,
      producerUserId,
      branchId: actor.branchId,
      now: this.deps.clock.now(),
    });

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateDevelopmentOutput, CreateDevelopmentError>> => {
        await tx.developments.save(development, actor.id);
        await tx.events.publish(development.pullEvents());
        await tx.audit.record(
          auditCreated(
            actor,
            developmentTarget('development.created', development),
            developmentCreatedState(development),
          ),
        );
        return ok({ developmentId: development.id, code: development.code, geocoding });
      },
    );
  }
}
