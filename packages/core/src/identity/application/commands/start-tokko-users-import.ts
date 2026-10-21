import {
  auditAction,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { TokkoUsersImport } from '../../domain/tokko-users-import';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';

/** No hay una API key de Tokko configurada. */
export interface TokkoUsersNotConfiguredError {
  readonly type: 'TokkoApiNotConfigured';
}

export type StartTokkoUsersImportError = ForbiddenError | TokkoUsersNotConfiguredError;

/**
 * Pide traer los usuarios de Tokko (#17): los crea un job (`identity.tokko_users_import_requested`),
 * porque los que ya no están en Tokko se conocen recorriendo todos sus contactos. La corrida queda
 * guardada para seguirla desde los procesos en segundo plano.
 */
export class StartTokkoUsersImport {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      /** Si hay una API key de Tokko configurada. */
      readonly configured: boolean;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<void, StartTokkoUsersImportError>> {
    if (!actor.can('users:create')) return err({ type: 'Forbidden' });
    if (!this.deps.configured) return err({ type: 'TokkoApiNotConfigured' });

    const job = TokkoUsersImport.request({
      id: nextId<'TokkoUsersImport'>(this.deps.ids),
      requestedBy: actor.id,
      now: this.deps.clock.now(),
    });
    await this.deps.uow.run(async (tx) => {
      await tx.tokkoUsersImports.save(job, actor.id);
      await tx.events.publish(job.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          {
            action: 'user.tokko_import_requested',
            entityType: 'user_import',
            entityId: job.id,
            clientIds: [],
          },
          { status: { before: null, after: 'requested' } },
        ),
      );
    });
    return ok(undefined);
  }
}
