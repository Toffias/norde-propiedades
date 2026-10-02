import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { ClientIdInputSchema, type ClientDetail, type ClientIdInput } from '../../contracts';
import { maskEmail, maskPhone } from '../../domain/contact-masking';
import {
  canReadClients,
  findClient,
  invalidInput,
  masksOwnerContact,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type GetClientDetailError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * La ficha de un contacto que el actor puede ver, con lo que puede hacer en ella. Si es
 * propietario y el actor no tiene "Ver datos de propietarios", teléfonos, emails y documento van
 * enmascarados.
 */
export class GetClientDetail {
  constructor(
    private readonly deps: { readonly uow: ClientsUnitOfWork; readonly agents: ClientAgents },
  ) {}

  async execute(
    input: ClientIdInput,
    actor: Actor,
  ): Promise<Result<ClientDetail, GetClientDetailError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ClientIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const client = await this.deps.uow.run((tx) => findClient(tx.clients, parsed.data.clientId));
    if (!client) return err({ type: 'ClientNotFound' });
    const { ownership } = client;
    if (!canActOn(actor, OWNERSHIP_RULES.clientsRead, ownership)) return err({ type: 'Forbidden' });

    const s = client.toSnapshot();
    const userIds = [s.agentId, s.deletedBy].filter((id) => id !== undefined);
    const names = await this.deps.agents.names(userIds);
    const ref = (id: string | undefined) =>
      id === undefined ? undefined : { id, name: names.get(id) };
    const masked = masksOwnerContact(actor, s.clientTypes);
    const canEdit = canActOn(actor, OWNERSHIP_RULES.clientsUpdate, ownership) && !client.isDeleted;
    const audit = OWNERSHIP_RULES.auditRead;

    return ok({
      id: s.id,
      kind: s.kind,
      name: s.name,
      phones: s.phones.map((p) => ({
        kind: p.kind,
        number: masked ? maskPhone(p.phone.e164) : p.phone.e164,
        contactHours: p.contactHours,
      })),
      emails: s.emails.map((e) => ({
        kind: e.kind,
        address: masked ? maskEmail(e.email.value) : e.email.value,
      })),
      clientTypes: s.clientTypes,
      agent: ref(s.agentId),
      branchId: s.branchId,
      profile: {
        ...s.profile,
        documentNumber:
          masked && s.profile.documentNumber !== undefined ? '•••' : s.profile.documentNumber,
      },
      channels: s.channels.map((c) => ({
        channel: c.channel,
        firstContactAt: c.firstContactAt,
        lastContactAt: c.lastContactAt,
      })),
      contactMasked: masked,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
      deletedBy: ref(s.deletedBy),
      can: {
        edit: canEdit,
        rename: canEdit && actor.can('clients:rename'),
        reassign: !client.isDeleted && actor.can('clients:reassign'),
        delete: canActOn(actor, OWNERSHIP_RULES.clientsDelete, ownership),
        viewHistory: accessScope(actor, audit) !== undefined && canActOn(actor, audit, ownership),
      },
    });
  }
}
