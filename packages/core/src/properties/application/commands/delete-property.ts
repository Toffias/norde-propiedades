import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import { PropertyIdInputSchema, type PropertyIdInput } from '../../contracts';
import type { PropertyAlreadyDeletedError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  findProperty,
  propertyTarget,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type DeletePropertyError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError | PropertyAlreadyDeletedError;

/**
 * Manda una propiedad a la papelera: las propias con `properties:delete`, las de cualquiera con
 * `properties:delete-others`.
 */
export class DeleteProperty {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: PropertyIdInput, actor: Actor): Promise<Result<void, DeletePropertyError>> {
    const rule = OWNERSHIP_RULES.propertiesDelete;
    if (!actor.can(rule.own) && !actor.can(rule.all)) return err({ type: 'Forbidden' });

    const parsed = PropertyIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeletePropertyError>> => {
      const property = await findProperty(tx.properties, parsed.data.propertyId);
      if (!property) return err({ type: 'PropertyNotFound' });
      if (!canActOn(actor, rule, property.ownership)) return err({ type: 'Forbidden' });

      const deleted = property.delete(actor.id, now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.properties.save(property, actor.id);
      await tx.events.publish(property.pullEvents());
      await tx.audit.record(auditAction(actor, propertyTarget('property.deleted', property.id)));
      return ok(undefined);
    });
  }
}
