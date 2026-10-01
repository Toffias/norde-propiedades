import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyInternalInfoInputSchema,
  type UpdatePropertyInternalInfoInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export interface UserNotFoundError {
  readonly type: 'UserNotFound';
}

export type UpdatePropertyInternalInfoError =
  EditPropertyError | PropertyInTrashError | UserNotFoundError;

/**
 * Información interna: tasadores, usuario de mantenimiento, ubicación de llaves, información legal
 * y comentarios internos. Los usuarios tienen que estar activos.
 */
export class UpdatePropertyInternalInfo {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly producers: Producers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdatePropertyInternalInfoInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyInternalInfoError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyInternalInfoInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, maintenanceUserId, appraiserUserIds, ...texts } = parsed.data;

    const users = [
      ...new Set([...appraiserUserIds, ...(maintenanceUserId ? [maintenanceUserId] : [])]),
    ];
    for (const userId of users) {
      if (!(await this.deps.producers.find(userId))) return err({ type: 'UserNotFound' });
    }
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: (property) =>
        property.updateInternalInfo(
          {
            maintenanceUserId,
            appraiserUserIds,
            keysLocation: texts.keysLocation,
            legalInfo: texts.legalInfo,
            internalComments: texts.internalComments,
          },
          now,
        ),
    });
  }
}
