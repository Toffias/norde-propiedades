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
import { CreatePropertyInputSchema, type CreatePropertyInput } from '../../contracts';
import { Coordinates, type InvalidCoordinatesError } from '../../domain/coordinates';
import { Property, type NegativePriceError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
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
  | ReferenceCodeUnavailableError;

export interface CreatePropertyOutput {
  readonly propertyId: string;
  readonly code: string;
}

/**
 * Alta corta de una propiedad: tipo, operación, dirección y ubicación. Queda como borrador, con
 * quien la carga como captador y su sucursal. El resto se completa en la ficha.
 */
export class CreateProperty {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly codes: ReferenceCodeAllocator;
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
      address: {
        street: data.street,
        streetNumber: data.streetNumber,
        floor: data.floor,
        unit: data.unit,
        neighborhood: data.neighborhood,
        city: data.city,
        province: data.province,
      },
      publishAddress: data.publishAddress,
      portalTitle: data.portalTitle,
      coordinates,
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
        return ok({ propertyId: property.id, code: property.code });
      },
    );
  }
}
