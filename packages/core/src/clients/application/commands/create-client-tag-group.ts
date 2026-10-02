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
import { CreateClientTagGroupInputSchema, type CreateClientTagGroupInput } from '../../contracts';
import { ClientTagGroup } from '../../domain/client-tag';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagGroupAuditState,
  tagCatalogTarget,
  type ClientTagGroupNameTakenError,
} from '../tag-support';

export type CreateClientTagGroupError =
  ForbiddenError | InvalidInputError | ClientTagGroupNameTakenError;

/** Crea un grupo de etiquetas de contactos, al final de la lista. */
export class CreateClientTagGroup {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateClientTagGroupInput,
    actor: Actor,
  ): Promise<Result<{ readonly groupId: string }, CreateClientTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = CreateClientTagGroupInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly groupId: string }, CreateClientTagGroupError>> => {
        if (await tx.tagGroups.findByName(name)) return err({ type: 'TagGroupNameTaken' });
        const group = ClientTagGroup.create({
          id: nextId<'ClientTagGroup'>(this.deps.ids),
          name,
          position: await tx.tagGroups.nextPosition(),
          now,
        });
        await tx.tagGroups.save(group, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            tagCatalogTarget('client_tag_group', 'client_tag_group.created', group.id),
            clientTagGroupAuditState(group),
          ),
        );
        return ok({ groupId: group.id });
      },
    );
  }
}
