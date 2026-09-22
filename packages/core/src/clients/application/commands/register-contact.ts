import {
  Email,
  err,
  nextId,
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
import { Client, type MissingContactInfoError } from '../../domain/client';
import { findOpenOpportunityAbout, Opportunity } from '../../domain/opportunity';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type RegisterContactError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | InvalidPhoneError
  | InvalidEmailError
  | MissingContactInfoError;

/**
 * Registra un contacto entrante (agente de IA, formulario, portal): deduplica el cliente por
 * teléfono o email, agrega el canal y abre una oportunidad, o suma el pedido a la oportunidad
 * abierta por lo mismo.
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
        const byPhone = contact.phone ? await tx.clients.findByPhone(contact.phone) : undefined;
        const existing =
          byPhone ?? (contact.email ? await tx.clients.findByEmail(contact.email) : undefined);

        let client: Client;
        if (existing) {
          client = existing;
          client.recordContact(data.channel, data.channelExternalId, now);
          client.completeProfile(contact);
        } else {
          const registered = Client.register({
            id: nextId<'Client'>(this.deps.ids),
            ...contact,
            channel: data.channel,
            channelExternalId: data.channelExternalId,
            now,
          });
          if (registered.isErr()) return err(registered.error);
          client = registered.value;
        }

        const { type, intent, propertyId, search, note, noMatchingStock } = data.opportunity;
        const open = findOpenOpportunityAbout(await tx.opportunities.findOpenByClient(client.id), {
          type,
          propertyId,
        });

        let opportunity: Opportunity;
        if (open) {
          opportunity = open;
          opportunity.addRequest({ intent, note, search, now });
          // Si antes tenía stock para ofrecerle y ahora no, pasa a "Aplica a otra inmobiliaria".
          if (noMatchingStock && opportunity.status === 'new') {
            opportunity.changeStatus('referred_to_partner', now);
          }
        } else {
          opportunity = Opportunity.open({
            id: nextId<'Opportunity'>(this.deps.ids),
            clientId: client.id,
            originChannel: data.channel,
            type,
            intent,
            noMatchingStock,
            propertyId,
            search,
            note,
            now,
          });
        }

        await tx.clients.save(client);
        await tx.opportunities.save(opportunity);
        await tx.events.publish([...client.pullEvents(), ...opportunity.pullEvents()]);
        await tx.audit.record({
          actorId: actor.id,
          action: existing ? 'client.contact_recorded' : 'client.registered',
          entityType: 'client',
          entityId: client.id,
        });
        await tx.audit.record({
          actorId: actor.id,
          action: open ? 'opportunity.request_added' : 'opportunity.opened',
          entityType: 'opportunity',
          entityId: opportunity.id,
        });

        return ok({
          clientId: client.id,
          opportunityId: opportunity.id,
          clientCreated: !existing,
          opportunityCreated: !open,
        });
      },
    );
  }
}
