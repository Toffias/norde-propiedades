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
  type Result,
} from '../../../shared';
import type { ClientEmail, ClientPhone } from '../../domain/client';
import { EMPTY_PROFILE, type ClientType } from '../../domain/client-values';
import { createClientIn } from '../client-creation';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** El propietario que trae una propiedad importada (la exportación de Tokko, #17). */
export interface FindOrCreateOwnerInput {
  readonly name: string;
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly sells: boolean;
  readonly rents: boolean;
  /** El productor de la propiedad: queda a cargo del contacto nuevo. */
  readonly agentId: string | undefined;
}

/** Sin nombre en Tokko, el contacto se llama así hasta que alguien lo complete. */
const UNNAMED_OWNER = 'Propietario';

/**
 * El contacto del propietario: el que ya tiene ese teléfono o email (la misma regla de duplicados
 * que el alta manual, aunque esté en la papelera) o uno nuevo, como propietario vendedor o
 * locador. Un teléfono o un email inválidos se ignoran; sin ninguno válido no hay contacto.
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

    const phone = input.phone === undefined ? undefined : Phone.create(input.phone);
    const email = input.email === undefined ? undefined : Email.create(input.email);
    const phones: ClientPhone[] =
      phone?.isOk() === true
        ? [{ kind: 'mobile', phone: phone.value, contactHours: undefined }]
        : [];
    const emails: ClientEmail[] =
      email?.isOk() === true ? [{ kind: 'main', email: email.value }] : [];
    if (phones.length === 0 && emails.length === 0) return ok(undefined);

    const clientTypes: ClientType[] = [
      ...(input.sells ? (['owner_seller'] as const) : []),
      ...(input.rents ? (['owner_landlord'] as const) : []),
    ];
    const agent =
      input.agentId === undefined ? undefined : await this.deps.agents.find(input.agentId);

    return this.deps.uow.run(async (tx) => {
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
      if (created.isOk()) return ok({ clientId: created.value.id });
      if (created.error.type === 'DuplicateClient') return ok({ clientId: created.error.clientId });
      // Con nombre y un teléfono o email válidos, el alta no puede fallar por datos faltantes.
      throw new Error(`Unexpected ${created.error.type} creating an owner`);
    });
  }
}
