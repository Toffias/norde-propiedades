import {
  auditCreated,
  Email,
  err,
  nextId,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { Client, type ClientEmail, type ClientPhone } from '../../domain/client';
import { EMPTY_PROFILE, type ClientType } from '../../domain/client-values';
import { createClientIn } from '../client-creation';
import { clientAuditState, clientTarget } from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';

/** El propietario que trae una propiedad importada (la exportación de Tokko, #17). */
export interface FindOrCreateOwnerInput {
  readonly name: string;
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly sells: boolean;
  readonly rents: boolean;
  /** El productor de la propiedad: queda a cargo del contacto nuevo. */
  readonly agentId: string | undefined;
  /** El ID del contacto en Tokko (desde la API): se busca primero por él y se guarda. */
  readonly tokkoId?: string | undefined;
}

/** Sin nombre en Tokko, el contacto se llama así hasta que alguien lo complete. */
const UNNAMED_OWNER = 'Propietario';

/**
 * El contacto del propietario: el que ya tiene ese ID de Tokko (si lo trae), el que tiene ese
 * teléfono o email (la misma regla de duplicados que el alta manual, aunque esté en la papelera)
 * o uno nuevo, como propietario vendedor o locador. Un teléfono o un email inválidos se ignoran.
 *
 * Sin ninguno válido: con el ID de Tokko se crea solo con el nombre (decidido con Norde el
 * 2026-10-20: si Tokko lo permite, Norde también), y el ID evita duplicarlo; sin el ID (la
 * exportación `.csv`) no hay contacto. Uno que pidió la supresión de sus datos no se vuelve a crear.
 */
export class FindOrCreateOwner {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: FindOrCreateOwnerInput,
    actor: Actor,
  ): Promise<Result<{ readonly clientId: string } | undefined, ForbiddenError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });
    const tokkoId = input.tokkoId;
    if (tokkoId !== undefined) {
      const known = await this.deps.uow.run((tx) => tx.externalIds.find('tokko', tokkoId));
      if (known?.erased) return ok(undefined);
      if (known) return ok({ clientId: known.clientId });
    }

    const phone = input.phone === undefined ? undefined : Phone.create(input.phone);
    const email = input.email === undefined ? undefined : Email.create(input.email);
    const phones: ClientPhone[] =
      phone?.isOk() === true
        ? [{ kind: 'mobile', phone: phone.value, contactHours: undefined }]
        : [];
    const emails: ClientEmail[] =
      email?.isOk() === true ? [{ kind: 'main', email: email.value }] : [];
    const withoutContact = phones.length === 0 && emails.length === 0;
    if (withoutContact && tokkoId === undefined) return ok(undefined);

    const clientTypes: ClientType[] = [
      ...(input.sells ? (['owner_seller'] as const) : []),
      ...(input.rents ? (['owner_landlord'] as const) : []),
    ];
    const agent =
      input.agentId === undefined ? undefined : await this.deps.agents.find(input.agentId);

    return this.deps.uow.run(async (tx) => {
      const clientId = withoutContact
        ? await this.#createWithoutContact(tx, actor, input, clientTypes, agent)
        : await this.#findOrCreate(tx, actor, input, { phones, emails, clientTypes, agent });
      if (tokkoId !== undefined) {
        await tx.externalIds.link({
          source: 'tokko',
          externalId: tokkoId,
          clientId,
          now: this.deps.clock.now(),
        });
      }
      return ok({ clientId });
    });
  }

  /** Solo con el nombre (o "Propietario", hasta que alguien lo complete). */
  async #createWithoutContact(
    tx: ClientsTransaction,
    actor: Actor,
    input: FindOrCreateOwnerInput,
    clientTypes: readonly ClientType[],
    agent: { readonly branchId: string | undefined } | undefined,
  ): Promise<string> {
    const created = Client.importedWithoutContact({
      id: nextId<'Client'>(this.deps.ids),
      name: input.name.trim() || UNNAMED_OWNER,
      clientTypes,
      agentId: agent ? input.agentId : undefined,
      branchId: agent?.branchId,
      now: this.deps.clock.now(),
    });
    // Con un nombre siempre presente, el alta no puede fallar.
    if (created.isErr()) throw new Error(`Unexpected ${created.error.type} creating an owner`);
    const client = created.value;
    await tx.clients.save(client, actor.id);
    await tx.events.publish(client.pullEvents());
    await tx.audit.record(
      auditCreated(actor, clientTarget('client.created', client.id), clientAuditState(client)),
    );
    return client.id;
  }

  async #findOrCreate(
    tx: ClientsTransaction,
    actor: Actor,
    input: FindOrCreateOwnerInput,
    data: {
      readonly phones: readonly ClientPhone[];
      readonly emails: readonly ClientEmail[];
      readonly clientTypes: readonly ClientType[];
      readonly agent: { readonly branchId: string | undefined } | undefined;
    },
  ): Promise<string> {
    const { phones, emails, clientTypes, agent } = data;
    const created = await createClientIn(tx, actor, {
      id: nextId<'Client'>(this.deps.ids),
      kind: 'person',
      name: input.name.trim() || UNNAMED_OWNER,
      phones,
      emails,
      clientTypes,
      agentId: agent ? input.agentId : undefined,
      branchId: agent?.branchId,
      profile: EMPTY_PROFILE,
      now: this.deps.clock.now(),
    });
    if (created.isOk()) return created.value.id;
    if (created.error.type === 'DuplicateClient') return created.error.clientId;
    // Con nombre y un teléfono o email válidos, el alta no puede fallar por datos faltantes.
    throw new Error(`Unexpected ${created.error.type} creating an owner`);
  }
}
