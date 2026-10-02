import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import { UpdateClientDetailsInputSchema, type UpdateClientDetailsInput } from '../../contracts';
import type {
  ClientEmail,
  ClientInTrashError,
  ClientPhone,
  MissingContactInfoError,
  MissingNameError,
} from '../../domain/client';
import { contactConflicts } from '../../domain/duplicate-check';
import {
  clientAuditState,
  clientTarget,
  findClient,
  invalidInput,
  masksOwnerContact,
  parseEmails,
  parsePhones,
  toProfile,
  type ClientNotFoundError,
  type DuplicateClientError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UpdateClientDetailsError =
  | ForbiddenError
  | InvalidInputError
  | InvalidPhoneError
  | InvalidEmailError
  | ClientNotFoundError
  | ClientInTrashError
  | MissingNameError
  | MissingContactInfoError
  | DuplicateClientError;

/**
 * Guarda una sección de la ficha (nombre, teléfonos y emails, tipos, datos). Los propios con
 * `clients:update`, los de otros con `clients:update-others`. Cambiar el nombre pide además
 * `clients:rename`, y los datos de contacto de un propietario solo los edita quien puede verlos.
 * Un teléfono o email que ya usa otro contacto no se acepta: sería un duplicado.
 */
export class UpdateClientDetails {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateClientDetailsInput,
    actor: Actor,
  ): Promise<Result<void, UpdateClientDetailsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = UpdateClientDetailsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    let contact: { phones: ClientPhone[]; emails: ClientEmail[] } | undefined;
    if (data.contact !== undefined) {
      const phones = parsePhones(data.contact.phones);
      if (phones.isErr()) return err(phones.error);
      const emails = parseEmails(data.contact.emails);
      if (emails.isErr()) return err(emails.error);
      contact = { phones: phones.value, emails: emails.value };
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateClientDetailsError>> => {
      const client = await findClient(tx.clients, data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
      if (client.isDeleted) return err({ type: 'ClientInTrash' });
      const before = clientAuditState(client);

      if (data.name !== undefined && data.name !== client.name) {
        if (!actor.can('clients:rename')) return err({ type: 'Forbidden' });
        const renamed = client.rename(data.name, now);
        if (renamed.isErr()) return err(renamed.error);
      }

      if (contact !== undefined) {
        if (masksOwnerContact(actor, client.toSnapshot().clientTypes)) {
          return err({ type: 'Forbidden' });
        }
        const keys = {
          phones: contact.phones.map((p) => p.phone),
          emails: contact.emails.map((e) => e.email),
        };
        const [conflict] = contactConflicts(client, await tx.clients.findMatching(keys), keys);
        if (conflict) {
          return err({
            type: 'DuplicateClient',
            clientId: conflict.id,
            trashed: conflict.isDeleted,
          });
        }
        const changed = client.changeContactInfo(contact, now);
        if (changed.isErr()) return err(changed.error);
      }

      if (data.clientTypes !== undefined) {
        const changed = client.changeTypes(data.clientTypes, now);
        if (changed.isErr()) return err(changed.error);
      }

      if (data.kind !== undefined || data.profile !== undefined) {
        const changed = client.updateDetails(
          { kind: data.kind, profile: data.profile === undefined ? {} : toProfile(data.profile) },
          now,
        );
        if (changed.isErr()) return err(changed.error);
      }

      const entry = auditUpdated(
        actor,
        clientTarget('client.updated', client.id),
        before,
        clientAuditState(client),
      );
      if (entry === undefined) return ok(undefined);
      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
