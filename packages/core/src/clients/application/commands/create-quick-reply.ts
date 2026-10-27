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
import {
  CreateQuickReplyInputSchema,
  type CreateQuickReplyInput,
  type CreateQuickReplyOutput,
} from '../../contracts';
import { QuickReply, type InvalidQuickReplyError } from '../../domain/quick-reply';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  canManageQuickReplies,
  quickReplyAuditState,
  quickReplyTarget,
} from '../quick-reply-support';

export type CreateQuickReplyError = ForbiddenError | InvalidInputError | InvalidQuickReplyError;

/** Una respuesta rápida nueva (`quick-replies:manage`): nace activa. */
export class CreateQuickReply {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateQuickReplyInput,
    actor: Actor,
  ): Promise<Result<CreateQuickReplyOutput, CreateQuickReplyError>> {
    if (!canManageQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = CreateQuickReplyInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { name, subject, body } = parsed.data;

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateQuickReplyOutput, CreateQuickReplyError>> => {
        const created = QuickReply.create({
          id: nextId<'QuickReply'>(this.deps.ids),
          name,
          subject,
          body,
          now: this.deps.clock.now(),
        });
        if (created.isErr()) return err(created.error);
        const reply = created.value;

        await tx.quickReplies.save(reply, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            quickReplyTarget('quick_reply.created', reply.id),
            quickReplyAuditState(reply),
          ),
        );
        return ok({ quickReplyId: reply.id });
      },
    );
  }
}
