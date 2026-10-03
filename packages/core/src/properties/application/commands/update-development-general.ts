import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdateDevelopmentGeneralInputSchema,
  type UpdateDevelopmentGeneralInput,
} from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UpdateDevelopmentGeneralError = EditDevelopmentError | DevelopmentInTrashError;

/** Nombre, tipo, título para portales, desarrollista, contacto comercial y página web. */
export class UpdateDevelopmentGeneral {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateDevelopmentGeneralInput,
    actor: Actor,
  ): Promise<Result<void, UpdateDevelopmentGeneralError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateDevelopmentGeneralInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, data.developmentId, {
      apply: (development) =>
        development.updateGeneral(
          {
            name: data.name,
            kind: data.developmentType,
            portalTitle: data.portalTitle,
            developerName: data.developerName,
            commercialContactClientId: data.commercialContactClientId,
            websiteUrl: data.websiteUrl,
          },
          now,
        ),
    });
  }
}
