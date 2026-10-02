import {
  Email,
  err,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import {
  RegisterContactInputSchema,
  type RegisterContactInput,
  type RegisterContactOutput,
} from '../../contracts';
import type { MissingContactInfoError } from '../../domain/client';
import { findExistingClient } from '../../domain/duplicate-check';
import { recordIncomingContact } from '../incoming-contact';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type RegisterContactError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | InvalidPhoneError
  | InvalidEmailError
  | MissingContactInfoError;

/**
 * Registra un contacto entrante (agente de IA, formulario, portal): deduplica el cliente por
 * teléfono o email (con la misma regla que el alta manual), agrega el canal y abre una
 * oportunidad, o suma el pedido a la oportunidad abierta por lo mismo. Si el cliente estaba en la
 * papelera, lo restaura: volvió a contactarse.
 */
export class RegisterContact {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RegisterContactInput,
    actor: Actor,
  ): Promise<Result<RegisterContactOutput, RegisterContactError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });

    const parsed = RegisterContactInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const data = parsed.data;

    let phone: Phone | undefined;
    if (data.phone !== undefined) {
      const created = Phone.create(data.phone);
      if (created.isErr()) return err(created.error);
      phone = created.value;
    }
    let email: Email | undefined;
    if (data.email !== undefined) {
      const created = Email.create(data.email);
      if (created.isErr()) return err(created.error);
      email = created.value;
    }

    const contact = { name: data.name, phone, email };
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<RegisterContactOutput, RegisterContactError>> => {
        const keys = {
          phones: contact.phone ? [contact.phone] : [],
          emails: contact.email ? [contact.email] : [],
        };
        const recorded = await recordIncomingContact(
          tx,
          actor,
          { ids: this.deps.ids, now },
          {
            existing: findExistingClient(await tx.clients.findMatching(keys), keys),
            contact,
            channel: data.channel,
            channelExternalId: data.channelExternalId,
            opportunity: data.opportunity,
          },
        );
        if (recorded.isErr()) return err(recorded.error);
        const { client, opportunity, clientCreated, opportunityCreated } = recorded.value;
        return ok({
          clientId: client.id,
          opportunityId: opportunity.id,
          clientCreated,
          opportunityCreated,
        });
      },
    );
  }
}
