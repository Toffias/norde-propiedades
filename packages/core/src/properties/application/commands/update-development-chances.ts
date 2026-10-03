import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdateDevelopmentChancesInputSchema,
  type UpdateDevelopmentChancesInput,
} from '../../contracts';
import type {
  DevelopmentInTrashError,
  InvalidDevelopmentChancesError,
} from '../../domain/development';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import { invalidInput } from '../property-support';

/** Uno de los agentes no existe o no está activo. */
export interface ChanceAgentNotFoundError {
  readonly type: 'ChanceAgentNotFound';
  readonly userId: string;
}

export type UpdateDevelopmentChancesError =
  | EditDevelopmentError
  | DevelopmentInTrashError
  | InvalidDevelopmentChancesError
  | ChanceAgentNotFoundError;

/**
 * La derivación por chances (pestaña Derivación): qué agentes reciben las consultas del
 * emprendimiento y cuántas, por su peso. La edita quien puede editar el emprendimiento; queda en su
 * historial como `development.chances_updated`.
 */
export class UpdateDevelopmentChances {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      /** Usuarios activos del panel: solo ellos reciben consultas. */
      readonly agents: Producers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdateDevelopmentChancesInput,
    actor: Actor,
  ): Promise<Result<void, UpdateDevelopmentChancesError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateDevelopmentChancesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { developmentId, agents } = parsed.data;
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, developmentId, {
      action: 'development.chances_updated',
      apply: async (development): Promise<Result<boolean, UpdateDevelopmentChancesError>> => {
        const before = new Set(development.toSnapshot().chances.map((c) => c.userId));
        const changed = development.setChances(agents, now);
        if (changed.isErr() || !changed.value) return changed;
        // Solo los que se suman: uno que ya estaba y se desactivó no impide cambiar a los demás
        // (el reparto lo saltea mientras esté inactivo).
        for (const { userId } of agents.filter((a) => !before.has(a.userId))) {
          if ((await this.deps.agents.find(userId)) === undefined) {
            return err({ type: 'ChanceAgentNotFound', userId });
          }
        }
        return changed;
      },
    });
  }
}
