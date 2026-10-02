import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  AssignInquiryInputSchema,
  type AssignInquiryInput,
  type AssignInquiryOutput,
} from '../../contracts';
import type { Client } from '../../domain/client';
import { findExistingClient } from '../../domain/duplicate-check';
import type { InquiryAlreadyAssignedError, InquiryInTrashError } from '../../domain/inquiry';
import {
  invalidInput,
  resolveAgent,
  type AgentNotFoundError,
  type DuplicateClientError,
  type InvalidInputError,
} from '../client-support';
import { assignInquiryIn, senderKeys, type AgentRef } from '../inquiry-assignment';
import {
  canManageInquiries,
  findInquiryForUpdate,
  type InquiryNotFoundError,
} from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** El cliente elegido no comparte el teléfono ni el email de la consulta. */
export interface InquiryClientMismatchError {
  readonly type: 'InquiryClientMismatch';
}

export type AssignInquiryError =
  | ForbiddenError
  | InvalidInputError
  | InquiryNotFoundError
  | InquiryAlreadyAssignedError
  | InquiryInTrashError
  | InquiryClientMismatchError
  | DuplicateClientError
  | AgentNotFoundError;

/**
 * "Asignar a este cliente" o "Crear cliente nuevo" desde la bandeja (`inquiries:manage`). Registra
 * el contacto con la misma regla que `RegisterContact`: agrega el canal al cliente (o lo crea) y
 * abre una oportunidad por la propiedad consultada, o suma el pedido a la abierta por lo mismo.
 *
 * El agente elegido queda a cargo de la oportunidad; si es otro que el que tenía, se reasigna y
 * corre la regla "al asignar". Un cliente nuevo, o uno sin agente, queda también a su cargo.
 */
export class AssignInquiry {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AssignInquiryInput,
    actor: Actor,
  ): Promise<Result<AssignInquiryOutput, AssignInquiryError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = AssignInquiryInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    let chosen: AgentRef | undefined;
    if (data.agentId !== undefined) {
      const resolved = await resolveAgent(this.deps.agents, data.agentId);
      if (resolved.isErr()) return err(resolved.error);
      chosen = resolved.value;
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<AssignInquiryOutput, AssignInquiryError>> => {
        const inquiry = await findInquiryForUpdate(tx.inquiries, data.inquiryId);
        if (!inquiry) return err({ type: 'InquiryNotFound' });
        if (inquiry.isDeleted) return err({ type: 'InquiryInTrash' });
        if (inquiry.status === 'assigned') return err({ type: 'InquiryAlreadyAssigned' });

        const keys = senderKeys(inquiry);
        const matches = await tx.clients.findMatching(keys);
        let existing: Client | undefined;
        if (data.target.kind === 'client') {
          const { clientId } = data.target;
          existing = matches.find((c) => c.id === clientId);
          if (!existing) return err({ type: 'InquiryClientMismatch' });
        } else {
          const duplicate = findExistingClient(matches, keys);
          if (duplicate) {
            return err({
              type: 'DuplicateClient',
              clientId: duplicate.id,
              trashed: duplicate.isDeleted,
            });
          }
        }

        const output = await assignInquiryIn(
          tx,
          actor,
          { ids: this.deps.ids, now },
          {
            inquiry,
            existing,
            type: data.type ?? inquiry.suggestedOpportunityType,
            // Sin elegir: el que ya tiene la oportunidad o, si nadie la tiene, quien asigna.
            chooseAgent: async (current) =>
              chosen ??
              (current.agentId === undefined && actor.kind === 'user'
                ? await this.actorAsAgent(actor)
                : current),
          },
        );
        return ok(output);
      },
    );
  }

  /** Quien asigna, si es un agente activo; si no, la oportunidad sigue sin nadie a cargo. */
  private async actorAsAgent(actor: Actor): Promise<AgentRef> {
    const resolved = await resolveAgent(this.deps.agents, actor.id);
    return resolved.isOk() ? resolved.value : { agentId: undefined, branchId: undefined };
  }
}
