import {
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateDevelopmentUnitInputSchema, type CreateDevelopmentUnitInput } from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import type { PropertyTypeDisabledError } from '../../domain/property-type-settings';
import {
  canEditDevelopments,
  loadDevelopmentForEdit,
  type DevelopmentNotFoundError,
} from '../development-support';
import {
  buildUnit,
  prepareUnitBase,
  saveNewUnit,
  type BuildUnitError,
} from '../development-unit-creation';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from '../ports/reference-code-allocator';
import { invalidInput, type InvalidInputError } from '../property-support';

export type CreateDevelopmentUnitError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentInTrashError
  | PropertyTypeDisabledError
  | ReferenceCodeUnavailableError
  | BuildUnitError;

export interface CreateDevelopmentUnitOutput {
  readonly propertyId: string;
  readonly code: string;
}

/**
 * Alta de una unidad desde la ficha del emprendimiento. La unidad es una propiedad con
 * `developmentId`: hereda la dirección privada y la de publicar, la ubicación, las coordenadas, los
 * servicios y amenities, el captador y la sucursal del emprendimiento. Se cargan tipología, piso,
 * unidad, superficie y precio; el resto se completa en su ficha. Nace como borrador.
 *
 * Pide crear propiedades y poder editar el emprendimiento (los propios, los de su sucursal o todos).
 */
export class CreateDevelopmentUnit {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly codes: ReferenceCodeAllocator;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateDevelopmentUnitInput,
    actor: Actor,
  ): Promise<Result<CreateDevelopmentUnitOutput, CreateDevelopmentUnitError>> {
    if (!actor.can('properties:create') || !canEditDevelopments(actor)) {
      return err({ type: 'Forbidden' });
    }
    const parsed = CreateDevelopmentUnitInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const prepared = await this.deps.uow.run(async (tx) => {
      const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
      if (loaded.isErr()) return err(loaded.error);
      return prepareUnitBase(tx, loaded.value, data.propertyType);
    });
    if (prepared.isErr()) return err(prepared.error);
    const base = prepared.value;

    const code = await this.deps.codes.allocate(
      {
        kind: data.propertyType,
        producerUserId: base.template.producerUserId,
        branchId: base.template.branchId,
      },
      actor,
    );
    if (code.isErr()) return err(code.error);

    const built = buildUnit(
      base,
      {
        developmentId: data.developmentId,
        propertyType: data.propertyType,
        operations: [
          { operation: data.operation, currency: data.currency, priceCents: data.price },
        ],
        floor: data.floor,
        unit: data.unit,
        rooms: data.rooms,
        surfaceTotalM2: data.surfaceTotalM2,
        surfaceCoveredM2: data.surfaceCoveredM2,
      },
      { id: nextId<'Property'>(this.deps.ids), code: code.value, now: this.deps.clock.now() },
    );
    if (built.isErr()) return err(built.error);
    const unit = built.value;

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateDevelopmentUnitOutput, CreateDevelopmentUnitError>> => {
        // Se vuelve a cargar: el emprendimiento pudo ir a la papelera mientras tanto.
        const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
        if (loaded.isErr()) return err(loaded.error);
        const development = loaded.value;
        if (development.isDeleted) return err({ type: 'DevelopmentInTrash' });

        await saveNewUnit(tx, actor, unit, development);
        return ok({ propertyId: unit.id, code: unit.code });
      },
    );
  }
}
