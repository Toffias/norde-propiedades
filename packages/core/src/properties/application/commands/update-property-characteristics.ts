import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyCharacteristicsInputSchema,
  type UpdatePropertyCharacteristicsInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type {
  CoveredExceedsTotalError,
  NegativeCharacteristicError,
} from '../../domain/property-details';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyCharacteristicsError =
  EditPropertyError | PropertyInTrashError | NegativeCharacteristicError | CoveredExceedsTotalError;

/** Ambientes, superficies y medidas, antigüedad, orientación, estado y disposición. */
export class UpdatePropertyCharacteristics {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyCharacteristicsInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyCharacteristicsError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyCharacteristicsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, ...characteristics } = parsed.data;
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: (property) =>
        property.updateCharacteristics(
          {
            rooms: characteristics.rooms,
            bedrooms: characteristics.bedrooms,
            bathrooms: characteristics.bathrooms,
            toilets: characteristics.toilets,
            parkingSpaces: characteristics.parkingSpaces,
            ageYears: characteristics.ageYears,
            orientation: characteristics.orientation,
            condition: characteristics.condition,
            disposition: characteristics.disposition,
            isFurnished: characteristics.isFurnished,
            professionalUse: characteristics.professionalUse,
            surfaceTotalM2: characteristics.surfaceTotalM2,
            surfaceCoveredM2: characteristics.surfaceCoveredM2,
            surfaceSemiCoveredM2: characteristics.surfaceSemiCoveredM2,
            surfaceLandM2: characteristics.surfaceLandM2,
            frontM: characteristics.frontM,
            depthM: characteristics.depthM,
          },
          now,
        ),
    });
  }
}
