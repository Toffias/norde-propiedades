import {
  auditAction,
  auditCreated,
  diffChanges,
  Email,
  err,
  isTokkoUnassignedAgent,
  nextId,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { User } from '../../domain/user';
import type { IdentityTransaction, IdentityUnitOfWork } from '../ports/identity-transaction';
import type { TokkoUser, TokkoUserSource } from '../ports/tokko-user-source';
import { userAuditState, userTarget } from '../user-audit';

/** No hay un rol "Agente" o una sucursal principal en Mi empresa. */
export interface TokkoUsersSetupMissingError {
  readonly type: 'TokkoUsersSetupMissing';
  readonly missing: 'agent_role' | 'main_branch';
}

export interface TokkoUsersUnavailableResultError {
  readonly type: 'TokkoUnavailable';
}

export type RunTokkoUsersImportError =
  ForbiddenError | TokkoUsersSetupMissingError | TokkoUsersUnavailableResultError;

/**
 * Qué pasó con los usuarios de Tokko. `skipped`: sin un email válido para darlo de alta.
 * `unassigned`: "Libre" o "Sin Asignar", que no se copian.
 */
export interface TokkoUsersImportSummary {
  readonly created: number;
  readonly suspended: number;
  readonly existing: number;
  readonly skipped: number;
  readonly unassigned: number;
}

/** El rol de los usuarios importados (decidido con Norde el 2026-10-21). */
const AGENT_ROLE_KEY = 'agent';

/**
 * Un email que no se entrega nunca (`.invalid`, RFC 2606), para un usuario que ya no está en Tokko
 * y no tiene uno: queda suspendido y solo figura como agente de sus contactos.
 */
function formerUserEmail(tokkoId: string): string {
  return `tokko-${tokkoId}@usuarios-tokko.invalid`;
}

/**
 * El job de `identity.tokko_users_import_requested` (#17): copia los usuarios de Tokko a Norde, para
 * que los contactos y las propiedades queden a cargo de los mismos agentes (decidido con Norde el
 * 2026-10-21: "la copia tiene que quedar tal cual").
 *
 * - Los vigentes en Tokko se crean activos; los que ya no están (agentes de contactos que no son
 *   usuarios) se crean suspendidos: figuran como agentes pero no entran.
 * - Todos con el rol Agente y la sucursal principal, y sin contraseña: entran cuando un
 *   administrador les blanquea una desde Usuarios.
 * - Uno que ya está en Norde (mismo email o mismo nombre) no se crea ni se cambia.
 * - "Libre" y "Sin Asignar" no son personas: no se copian (sus contactos quedan sin agente).
 */
export class RunTokkoUsersImport {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      /** Sin la API key configurada, no hay nada que traer. */
      readonly source: TokkoUserSource | undefined;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<TokkoUsersImportSummary, RunTokkoUsersImportError>> {
    if (!actor.can('users:create')) return err({ type: 'Forbidden' });
    const { source } = this.deps;
    if (!source) return err({ type: 'TokkoUnavailable' });

    const setup = await this.deps.uow.run(async (tx) => ({
      role: await tx.roles.findByKey(AGENT_ROLE_KEY),
      branch: await tx.branches.findMain(),
    }));
    if (!setup.role || setup.role.isDeleted) {
      return err({ type: 'TokkoUsersSetupMissing', missing: 'agent_role' });
    }
    if (!setup.branch) return err({ type: 'TokkoUsersSetupMissing', missing: 'main_branch' });
    const target = { roleId: setup.role.id, branchId: setup.branch.id };

    const current = await source.users();
    if (current.isErr()) return err({ type: 'TokkoUnavailable' });
    const former = await source.formerAgents(new Set(current.value.map((u) => u.tokkoId)));
    if (former.isErr()) return err({ type: 'TokkoUnavailable' });

    const summary = { created: 0, suspended: 0, existing: 0, skipped: 0, unassigned: 0 };
    for (const user of current.value) {
      summary[await this.#copy(actor, user, target, false)] += 1;
    }
    for (const user of former.value) {
      summary[await this.#copy(actor, user, target, true)] += 1;
    }
    return ok(summary);
  }

  async #copy(
    actor: Actor,
    tokko: TokkoUser,
    target: { readonly roleId: string; readonly branchId: string },
    formerUser: boolean,
  ): Promise<keyof TokkoUsersImportSummary> {
    const name = tokko.name.trim();
    // "Libre" y "Sin Asignar" no son personas: sus contactos quedan sin agente.
    if (isTokkoUnassignedAgent(name)) return 'unassigned';
    const given = tokko.email === undefined ? undefined : Email.create(tokko.email);
    let email: Email | undefined;
    if (given?.isOk() === true) email = given.value;
    else if (formerUser) {
      const placeholder = Email.create(formerUserEmail(tokko.tokkoId));
      if (placeholder.isOk()) email = placeholder.value;
    }
    if (name === '' || email === undefined) return 'skipped';
    const phone = tokko.phone === undefined ? undefined : Phone.create(tokko.phone);

    return this.deps.uow.run(async (tx) => {
      if (await this.#exists(tx, name, email)) return 'existing';
      const now = this.deps.clock.now();
      const created = User.create({
        id: nextId<'User'>(this.deps.ids),
        name,
        email,
        phone: phone?.isOk() === true ? phone.value : undefined,
        branchId: target.branchId,
        roleIds: [target.roleId],
        now,
      });
      // Con un rol, el alta no falla.
      if (created.isErr()) throw new Error(`Unexpected ${created.error.type} copying a Tokko user`);
      const user = created.value;
      await tx.users.save(user, actor.id);
      await tx.audit.record(
        auditCreated(actor, userTarget('user.imported', user.id), userAuditState(user)),
      );
      if (formerUser) {
        const before = userAuditState(user);
        const suspended = user.suspend(actor.id, now);
        if (suspended.isErr()) throw new Error(`Unexpected ${suspended.error.type} on a new user`);
        await tx.users.save(user, actor.id);
        await tx.audit.record(
          auditAction(
            actor,
            userTarget('user.suspended', user.id),
            diffChanges(before, userAuditState(user)),
          ),
        );
      }
      await tx.events.publish(user.pullEvents());
      return formerUser ? 'suspended' : 'created';
    });
  }

  /** Ya está en Norde con ese email o con ese nombre (sin mayúsculas ni acentos). */
  async #exists(tx: IdentityTransaction, name: string, email: Email): Promise<boolean> {
    return (
      (await tx.users.findByEmail(email)) !== undefined ||
      (await tx.users.findByName(name)) !== undefined
    );
  }
}
