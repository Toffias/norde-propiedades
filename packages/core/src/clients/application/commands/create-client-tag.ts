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
import { CreateClientTagInputSchema, type CreateClientTagInput } from '../../contracts';
import { ClientTag } from '../../domain/client-tag';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagAuditState,
  resolveTagGroup,
  tagCatalogTarget,
  type ClientTagGroupNotFoundError,
  type ClientTagNameTakenError,
} from '../tag-support';

export type CreateClientTagError =
  ForbiddenError | InvalidInputError | ClientTagGroupNotFoundError | ClientTagNameTakenError;

/** Crea una etiqueta de contactos, suelta o dentro de un grupo. */
export class CreateClientTag {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateClientTagInput,
    actor: Actor,
  ): Promise<Result<{ readonly tagId: string }, CreateClientTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = CreateClientTagInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly tagId: string }, CreateClientTagError>> => {
        const group = await resolveTagGroup(tx, groupId);
        if (group === undefined) return err({ type: 'TagGroupNotFound' });
        if (await tx.tags.findInGroup(group ?? undefined, name)) {
          return err({ type: 'TagNameTaken' });
        }

        const tag = ClientTag.create({
          id: nextId<'ClientTag'>(this.deps.ids),
          groupId: group ?? undefined,
          name,
          now,
        });
        await tx.tags.save(tag, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            tagCatalogTarget('client_tag', 'client_tag.created', tag.id),
            clientTagAuditState(tag),
          ),
        );
        return ok({ tagId: tag.id });
      },
    );
  }
}
