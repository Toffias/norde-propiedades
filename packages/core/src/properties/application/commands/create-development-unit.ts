import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type AuditState,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateDevelopmentUnitInputSchema, type CreateDevelopmentUnitInput } from '../../contracts';
import type { DevelopmentInTrashError, DevelopmentUnitTemplate } from '../../domain/development';
import { Property, type NegativePriceError } from '../../domain/property';
import type { PropertyKind } from '../../domain/property-catalog';
import {
  EMPTY_CHARACTERISTICS,
  validateCharacteristics,
  type CoveredExceedsTotalError,
  type NegativeCharacteristicError,
} from '../../domain/property-details';
import {
  ensureTypeEnabled,
  type PropertyTypeDisabledError,
} from '../../domain/property-type-settings';
import { idOf, placeFromLineage, type Place } from '../catalog-support';
import {
  canEditDevelopments,
  developmentTarget,
  loadDevelopmentForEdit,
  type DevelopmentNotFoundError,
} from '../development-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from '../ports/reference-code-allocator';
import {
  invalidInput,
  propertyAuditState,
  propertyTarget,
  type InvalidInputError,
} from '../property-support';

export type CreateDevelopmentUnitError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentInTrashError
  | PropertyTypeDisabledError
  | ReferenceCodeUnavailableError
  | NegativePriceError
  | NegativeCharacteristicError
  | CoveredExceedsTotalError;

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

    const prepared = await this.deps.uow.run((tx) => prepareUnit(tx, actor, data));
    if (prepared.isErr()) return err(prepared.error);
    const { template, place } = prepared.value;

    const code = await this.deps.codes.allocate(
      {
        kind: data.propertyType,
        producerUserId: template.producerUserId,
        branchId: template.branchId,
      },
      actor,
    );
    if (code.isErr()) return err(code.error);

    const now = this.deps.clock.now();
    const created = Property.create({
      id: nextId<'Property'>(this.deps.ids),
      code: code.value,
      kind: data.propertyType,
      operation: { operation: data.operation, currency: data.currency, priceCents: data.price },
      address: {
        street: template.privateAddress,
        streetNumber: undefined,
        floor: data.floor,
        unit: data.unit,
        neighborhood: place.neighborhood,
        city: place.city,
        province: place.province,
      },
      publishAddress: template.publishAddress,
      portalTitle: undefined,
      coordinates: template.coordinates,
      locationId: place.locationId,
      developmentId: data.developmentId,
      producerUserId: template.producerUserId,
      branchId: template.branchId,
      now,
    });
    if (created.isErr()) return err(created.error);
    const unit = created.value;
    const characteristics = validateCharacteristics({
      ...EMPTY_CHARACTERISTICS,
      rooms: data.rooms,
      surfaceTotalM2: data.surfaceTotalM2,
      surfaceCoveredM2: data.surfaceCoveredM2,
    });
    if (characteristics.isErr()) return err(characteristics.error);
    // Recién creada no está en la papelera y las características ya se validaron: no puede fallar.
    unit.updateCharacteristics(characteristics.value, now);
    unit.updateFeatures(template.featureIds, now);

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateDevelopmentUnitOutput, CreateDevelopmentUnitError>> => {
        // Se vuelve a cargar: el emprendimiento pudo ir a la papelera mientras tanto.
        const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
        if (loaded.isErr()) return err(loaded.error);
        const development = loaded.value;
        if (development.isDeleted) return err({ type: 'DevelopmentInTrash' });

        await tx.properties.save(unit, actor.id);
        await tx.events.publish(unit.pullEvents());
        await tx.audit.record(
          auditCreated(actor, propertyTarget('property.created', unit.id), unitCreatedState(unit)),
        );
        await tx.audit.record(
          auditAction(
            actor,
            developmentTarget('development.unit_added', development),
            diffChanges({}, { unitId: unit.id, unitCode: unit.code }),
          ),
        );
        return ok({ propertyId: unit.id, code: unit.code });
      },
    );
  }
}

/** Los valores del alta de la unidad: los del alta de una propiedad más lo heredado y lo cargado. */
function unitCreatedState(unit: Property): AuditState {
  const s = unit.toSnapshot();
  return {
    ...propertyAuditState(unit),
    rooms: s.characteristics.rooms,
    surfaceTotalM2: s.characteristics.surfaceTotalM2,
    surfaceCoveredM2: s.characteristics.surfaceCoveredM2,
    featureIds: s.featureIds.length === 0 ? undefined : [...s.featureIds].sort(),
  };
}

/** El emprendimiento con su chequeo de pertenencia, lo que hereda la unidad y su ubicación. */
async function prepareUnit(
  tx: PropertiesTransaction,
  actor: Actor,
  data: { readonly developmentId: string; readonly propertyType: PropertyKind },
): Promise<
  Result<
    { readonly template: DevelopmentUnitTemplate; readonly place: Place },
    ForbiddenError | DevelopmentNotFoundError | DevelopmentInTrashError | PropertyTypeDisabledError
  >
> {
  const loaded = await loadDevelopmentForEdit(tx, actor, data.developmentId);
  if (loaded.isErr()) return err(loaded.error);
  const template = loaded.value.unitTemplate();
  if (template.isErr()) return err(template.error);
  const enabled = ensureTypeEnabled(await tx.typeSettings.find(data.propertyType));
  if (enabled.isErr()) return err(enabled.error);

  // Los emprendimientos cargados antes del panel pueden no tener ubicación del catálogo.
  const { locationId } = template.value;
  const id = locationId === undefined ? undefined : idOf<'Location'>(locationId);
  const lineage = id === undefined ? [] : await tx.locations.findLineage(id);
  const place: Place =
    locationId === undefined || lineage.length === 0
      ? { locationId: undefined, neighborhood: '', city: '', province: '' }
      : placeFromLineage(locationId, lineage);
  return ok({ template: template.value, place });
}
