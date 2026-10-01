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
import { CreateCustomAttributeInputSchema, type CreateCustomAttributeInput } from '../../contracts';
import {
  CustomAttribute,
  type InvalidCustomAttributeOptionsError,
} from '../../domain/custom-attribute';
import { catalogTarget, customAttributeAuditState } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export interface CustomAttributeNameTakenError {
  readonly type: 'CustomAttributeNameTaken';
}

export type CreateCustomAttributeError =
  | ForbiddenError
  | InvalidInputError
  | CustomAttributeNameTakenError
  | InvalidCustomAttributeOptionsError;

/** Suma un atributo personalizado a la ficha de propiedades (Mi empresa), al final de la lista. */
export class CreateCustomAttribute {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateCustomAttributeInput,
    actor: Actor,
  ): Promise<Result<{ readonly attributeId: string }, CreateCustomAttributeError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = CreateCustomAttributeInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { name, kind, options } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly attributeId: string }, CreateCustomAttributeError>> => {
        if (await tx.customAttributes.findByName(name)) {
          return err({ type: 'CustomAttributeNameTaken' });
        }
        const created = CustomAttribute.create({
          id: nextId<'CustomAttribute'>(this.deps.ids),
          name,
          kind,
          options,
          position: await tx.customAttributes.nextPosition(),
          now,
        });
        if (created.isErr()) return err(created.error);
        const attribute = created.value;

        await tx.customAttributes.save(attribute, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('custom_attribute', 'custom_attribute.created', attribute.id),
            customAttributeAuditState(attribute),
          ),
        );
        return ok({ attributeId: attribute.id });
      },
    );
  }
}
