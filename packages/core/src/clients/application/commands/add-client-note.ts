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
import {
  canUpdateOpportunity,
  findOpportunity,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type AddClientNoteError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | OpportunityNotFoundError
  | EmptyNoteError
  | NoteTooLongError;

/**
 * Nota en la actividad del contacto ("Llamé, vuelve a llamar el lunes"). La agrega quien puede
 * editar el contacto y queda también en su historial. La que se escribe sobre una oportunidad (desde
 * el tablero) la agrega quien puede editar esa oportunidad, aunque el contacto sea de otro agente, y
 * queda también en el historial de la oportunidad.
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
    const parsed = AddClientNoteInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { clientId, opportunityId, text } = parsed.data;
    const rule =
      opportunityId === undefined
        ? OWNERSHIP_RULES.clientsUpdate
        : OWNERSHIP_RULES.opportunitiesUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly noteId: string }, AddClientNoteError>> => {
        const client = await findClient(tx.clients, clientId);
        if (!client) return err({ type: 'ClientNotFound' });
        if (opportunityId === undefined) {
          if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
        } else {
          const opportunity = await findOpportunity(tx, opportunityId);
          if (opportunity?.clientId !== client.id) return err({ type: 'OpportunityNotFound' });
          if (!canUpdateOpportunity(actor, opportunity.ownership)) {
            return err({ type: 'Forbidden' });
          }
        }
        if (client.isDeleted) return err({ type: 'ClientInTrash' });

        const note = noteActivity({
          id: this.deps.ids.next(),
          clientId: client.id,
          opportunityId,
          text,
          actorId: actor.id,
          now,
        });
        if (note.isErr()) return err(note.error);

        await tx.activities.add(note.value, actor.id);
        await tx.audit.record(
          auditAction(actor, clientTarget('client.note_added', client.id), {
            note: { before: null, after: note.value.body.text },
            ...(opportunityId === undefined
              ? {}
              : { opportunityId: { before: null, after: opportunityId } }),
          }),
        );
        return ok({ noteId: note.value.id });
      },
    );
  }
}
