import { auditCreated, err, ok, type Actor, type Result } from '../../shared';
import {
  Client,
  type ClientEmail,
  type ClientId,
  type ClientPhone,
  type MissingContactInfoError,
  type MissingNameError,
} from '../domain/client';
import type { ClientKind, ClientProfile, ClientType } from '../domain/client-values';
import { findExistingClient } from '../domain/duplicate-check';

import { clientAuditState, clientTarget, type DuplicateClientError } from './client-support';
import type { ClientsTransaction } from './ports/clients-transaction';

export interface NewClientData {
  readonly id: ClientId;
  readonly kind: ClientKind;
  readonly name: string;
  readonly phones: readonly ClientPhone[];
  readonly emails: readonly ClientEmail[];
  readonly clientTypes: readonly ClientType[];
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly profile: ClientProfile;
  readonly now: Date;
}

/**
 * El alta de un contacto dentro de la transacción, compartida por el alta manual y la importación.
 * Si ya hay uno con alguno de sus teléfonos o emails (aunque esté en la papelera) no se crea otro.
 */
export async function createClientIn(
  tx: ClientsTransaction,
  actor: Actor,
  data: NewClientData,
): Promise<Result<Client, DuplicateClientError | MissingNameError | MissingContactInfoError>> {
  const contact = {
    phones: data.phones.map((p) => p.phone),
    emails: data.emails.map((e) => e.email),
  };
  const existing = findExistingClient(await tx.clients.findMatching(contact), contact);
  if (existing) {
    return err({ type: 'DuplicateClient', clientId: existing.id, trashed: existing.isDeleted });
  }

  const created = Client.create(data);
  if (created.isErr()) return err(created.error);
  const client = created.value;

  await tx.clients.save(client, actor.id);
  await tx.events.publish(client.pullEvents());
  await tx.audit.record(
    auditCreated(actor, clientTarget('client.created', client.id), clientAuditState(client)),
  );
  return ok(client);
}
