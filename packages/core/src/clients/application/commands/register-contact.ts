import {
  auditAction,
  diffChanges,
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
import { maskSensitiveNumbers } from '../../domain/contact-masking';
import { findExistingClient } from '../../domain/duplicate-check';
import type { Inquiry } from '../../domain/inquiry';
import type { Opportunity } from '../../domain/opportunity';
import { recordIncomingContact } from '../incoming-contact';
import { assignmentState } from '../inquiry-assignment';
import { receiveInquiryIn } from '../inquiry-intake';
import { inquiryTarget } from '../inquiry-support';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import type { InquiryPropertyLookup } from '../ports/inquiry-property-lookup';

export type RegisterContactError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | InvalidPhoneError
  | InvalidEmailError
  | MissingContactInfoError;

/**
 * Registra un contacto que trae el agente de IA: deduplica el cliente por teléfono o email (con la
 * misma regla que el alta manual), agrega el canal y abre una oportunidad, o suma el pedido a la
 * oportunidad abierta por lo mismo. Si el cliente estaba en la papelera, lo restaura: volvió a
 * contactarse.
 *
 * Además deja la consulta en la bandeja (#45), una por oportunidad: pendiente si la oportunidad no
 * tiene agente (asignarla le pone uno), o ya asignada a su agente si lo tiene.
 */
export class RegisterContact {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly properties: InquiryPropertyLookup;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RegisterContactInput,
    actor: Actor,
  ): Promise<Result<RegisterContactOutput, RegisterContactError>> {
    if (!actor.can('clients:create') || !actor.can('inquiries:receive')) {
      return err({ type: 'Forbidden' });
    }

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
    const { propertyId } = data.opportunity;
    const property =
      propertyId === undefined ? undefined : await this.deps.properties.facts(propertyId);
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

        const inbox = await receiveInquiryIn(
          tx,
          actor,
          { ids: this.deps.ids, now },
          {
            channel: data.channel,
            // Una por oportunidad: otro pedido por lo mismo no suma otra consulta a la bandeja.
            externalId: opportunity.id,
            receivedAt: now,
            name: contact.name,
            phone,
            email,
            message:
              data.opportunity.note === undefined
                ? undefined
                : maskSensitiveNumbers(data.opportunity.note),
            propertyId,
            developmentId: undefined,
            property,
            opportunityId: opportunity.id,
          },
        );
        // `recordIncomingContact` ya exigió un teléfono o un email.
        if (inbox.isErr()) throw new Error('Inquiry without contact info after registering it');
        if (!inbox.value.duplicate) {
          await this.assignToOwner(tx, actor, inbox.value.inquiry, opportunity, client.id, now);
        }

        return ok({
          clientId: client.id,
          opportunityId: opportunity.id,
          clientCreated,
          opportunityCreated,
        });
      },
    );
  }

  /**
   * Si la oportunidad ya tiene agente, la consulta queda asignada a él: no hay nada que repartir.
   * Si no, queda pendiente en la bandeja.
   */
  private async assignToOwner(
    tx: ClientsTransaction,
    actor: Actor,
    inquiry: Inquiry,
    opportunity: Opportunity,
    clientId: string,
    now: Date,
  ): Promise<void> {
    const { ownerId, ownerBranchId } = opportunity.ownership;
    if (ownerId === undefined) return;
    const before = assignmentState(inquiry);
    const assigned = inquiry.assign({
      clientId,
      opportunityId: opportunity.id,
      agent: { agentId: ownerId, branchId: ownerBranchId },
      by: actor.id,
      now,
    });
    // Recién recibida: está pendiente.
    if (assigned.isErr()) throw new Error(`Inquiry ${inquiry.id} is not pending`);
    await tx.inquiries.save(inquiry, actor.id);
    await tx.events.publish(inquiry.pullEvents());
    await tx.audit.record(
      auditAction(
        actor,
        inquiryTarget('inquiry.assigned', inquiry),
        diffChanges(before, assignmentState(inquiry)),
      ),
    );
  }
}
