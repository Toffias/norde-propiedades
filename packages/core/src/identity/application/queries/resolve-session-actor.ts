import { Actor, err, ok, type ForbiddenError, type Result } from '../../../shared';
import type { SessionProfile } from '../../contracts';
import { canSignIn, effectivePermissions } from '../../domain/access';
import type { UserAccessQuery } from '../ports/user-access-query';

export interface ResolveSessionActorInput {
  /** Usuario de la sesión ya validada por el proveedor de autenticación. */
  readonly userId: string;
  /** ID del request: agrupa la auditoría de lo que haga el usuario en él. */
  readonly correlationId?: string;
}

export interface SessionActor {
  readonly actor: Actor;
  readonly profile: SessionProfile;
}

export type ResolveSessionActorError =
  ForbiddenError | { readonly type: 'UserNotFound' } | { readonly type: 'UserSuspended' };

/** Arma el `Actor` de una sesión del panel con los permisos efectivos del usuario. */
export class ResolveSessionActor {
  constructor(private readonly deps: { readonly users: UserAccessQuery }) {}

  async execute(
    input: ResolveSessionActorInput,
    actor: Actor,
  ): Promise<Result<SessionActor, ResolveSessionActorError>> {
    if (!actor.can('sessions:resolve')) return err({ type: 'Forbidden' });

    const user = await this.deps.users.findByUserId(input.userId);
    if (!user) return err({ type: 'UserNotFound' });
    if (!canSignIn(user.status)) return err({ type: 'UserSuspended' });

    // Con una contraseña temporal (alta o blanqueo) no puede hacer nada más que cambiarla: quien
    // la conoce es el administrador que la puso.
    const { granted, denied } = user.mustChangePassword
      ? { granted: [], denied: [] }
      : effectivePermissions(user.rolePermissions, user.userPermissions);
    const sessionActor = Actor.user(user.id, granted, denied).withBranch(user.branchId);

    return ok({
      actor:
        input.correlationId === undefined
          ? sessionActor
          : sessionActor.withCorrelation(input.correlationId),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        mustChangePassword: user.mustChangePassword,
      },
    });
  }
}
