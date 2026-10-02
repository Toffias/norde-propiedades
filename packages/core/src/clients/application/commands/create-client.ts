import {
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import {
  CreateClientInputSchema,
  type CreateClientInput,
  type CreateClientOutput,
} from '../../contracts';
import type { MissingContactInfoError, MissingNameError } from '../../domain/client';
import { createClientIn } from '../client-creation';
import {
  invalidInput,
  parseEmails,
  parsePhones,
  resolveAgent,
  toProfile,
  type AgentNotFoundError,
  type DuplicateClientError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CreateClientError =
  | ForbiddenError
  | InvalidInputError
  | InvalidPhoneError
  | InvalidEmailError
  | MissingNameError
  | MissingContactInfoError
  | AgentNotFoundError
  | DuplicateClientError;

/**
 * Alta manual de un contacto desde el panel. Si ya hay uno con alguno de sus teléfonos o emails
 * (aunque esté en la papelera) no se crea otro: se informa cuál es. Sin agente elegido, queda a
 * cargo de quien lo da de alta; asignárselo a otro pide `clients:reassign`.
 */
export class CreateClient {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateClientInput,
    actor: Actor,
  ): Promise<Result<CreateClientOutput, CreateClientError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });

    const parsed = CreateClientInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    const phones = parsePhones(data.phones);
    if (phones.isErr()) return err(phones.error);
    const emails = parseEmails(data.emails);
    if (emails.isErr()) return err(emails.error);

    const agentId = data.agentId ?? (actor.kind === 'user' ? actor.id : undefined);
    if (agentId !== actor.id && agentId !== undefined && !actor.can('clients:reassign')) {
      return err({ type: 'Forbidden' });
    }
    const agent = await resolveAgent(this.deps.agents, agentId);
    if (agent.isErr()) return err(agent.error);

    const now = this.deps.clock.now();
    return this.deps.uow.run(async (tx): Promise<Result<CreateClientOutput, CreateClientError>> => {
      const created = await createClientIn(tx, actor, {
        id: nextId<'Client'>(this.deps.ids),
        kind: data.kind,
        name: data.name,
        phones: phones.value,
        emails: emails.value,
        clientTypes: data.clientTypes,
        agentId: agent.value.agentId,
        branchId: agent.value.branchId,
        profile: toProfile(data.profile),
        now,
      });
      if (created.isErr()) return err(created.error);
      return ok({ clientId: created.value.id });
    });
  }
}
