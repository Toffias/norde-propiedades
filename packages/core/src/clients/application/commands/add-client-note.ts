import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { AddClientNoteInputSchema, type AddClientNoteInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  noteActivity,
  type EmptyNoteError,
  type NoteTooLongError,
} from '../../domain/client-activity';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type AddClientNoteError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | EmptyNoteError
  | NoteTooLongError;

/**
 * Nota en la actividad del contacto ("Llamé, vuelve a llamar el lunes"). La agrega quien puede
 * editar el contacto y queda también en su historial.
 */
export class AddClientNote {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AddClientNoteInput,
    actor: Actor,
  ): Promise<Result<{ readonly noteId: string }, AddClientNoteError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = AddClientNoteInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly noteId: string }, AddClientNoteError>> => {
        const client = await findClient(tx.clients, parsed.data.clientId);
        if (!client) return err({ type: 'ClientNotFound' });
        if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
        if (client.isDeleted) return err({ type: 'ClientInTrash' });

        const note = noteActivity({
          id: this.deps.ids.next(),
          clientId: client.id,
          text: parsed.data.text,
          actorId: actor.id,
          now,
        });
        if (note.isErr()) return err(note.error);

        await tx.activities.add(note.value, actor.id);
        await tx.audit.record(
          auditAction(actor, clientTarget('client.note_added', client.id), {
            note: { before: null, after: note.value.body.text },
          }),
        );
        return ok({ noteId: note.value.id });
      },
    );
  }
}
