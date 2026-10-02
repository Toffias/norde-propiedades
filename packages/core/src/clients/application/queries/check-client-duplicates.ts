import {
  Email,
  err,
  ok,
  Phone,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  CheckClientDuplicatesInputSchema,
  type CheckClientDuplicatesInput,
  type ClientDuplicates,
} from '../../contracts';
import { findExistingClient, possibleDuplicates } from '../../domain/duplicate-check';
import { invalidInput, toDuplicateRef, type InvalidInputError } from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CheckClientDuplicatesError = ForbiddenError | InvalidInputError;

/**
 * Antes de dar de alta: ¿ya existe? Busca por teléfono y email en todos los contactos (también
 * los de la papelera y los de otros agentes, para no duplicarlos) y, por nombre, posibles
 * duplicados. De los que el actor no puede ver se informa solo el nombre y el agente.
 */
export class CheckClientDuplicates {
  constructor(
    private readonly deps: { readonly uow: ClientsUnitOfWork; readonly agents: ClientAgents },
  ) {}

  async execute(
    input: CheckClientDuplicatesInput,
    actor: Actor,
  ): Promise<Result<ClientDuplicates, CheckClientDuplicatesError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });

    const parsed = CheckClientDuplicatesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { name, phones, emails } = parsed.data;

    // Un dato a medio escribir no es un error acá: se ignora hasta que sea válido.
    const contact = {
      phones: phones.flatMap((raw) => {
        const phone = Phone.create(raw);
        return phone.isOk() ? [phone.value] : [];
      }),
      emails: emails.flatMap((raw) => {
        const email = Email.create(raw);
        return email.isOk() ? [email.value] : [];
      }),
    };

    const { existing, possible } = await this.deps.uow.run(async (tx) => {
      const hasContact = contact.phones.length > 0 || contact.emails.length > 0;
      const matches = hasContact ? await tx.clients.findMatching(contact) : [];
      const sameName = name === undefined || name === '' ? [] : await tx.clients.findByName(name);
      return {
        existing: findExistingClient(matches, contact),
        possible: name === undefined ? [] : possibleDuplicates(name, sameName, contact),
      };
    });

    const agentIds = [existing, ...possible].flatMap((c) => c?.toSnapshot().agentId ?? []);
    const names = await this.deps.agents.names([...new Set(agentIds)]);
    return ok({
      existing: existing && toDuplicateRef(existing, names, actor),
      possible: possible
        .filter((c) => c.id !== existing?.id)
        .map((c) => toDuplicateRef(c, names, actor)),
    });
  }
}
