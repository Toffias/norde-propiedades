import { accessScope, OWNERSHIP_RULES, type VisibilityFilter } from '../../identity';
import type { Actor } from '../../shared';

/** Hasta dónde ve quien mira Inicio: todo, lo suyo más lo de su sucursal, o solo lo suyo. */
export type HomeVisibility = Exclude<VisibilityFilter, { readonly kind: 'none' }>;

/** El alcance de quien mira y los filtros que eligió; la query aplica los tres juntos. */
export interface HomeScope {
  readonly visibility: HomeVisibility;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
}

/**
 * Inicio muestra la cartera con el alcance de las oportunidades: un agente ve lo suyo, un gerente
 * lo de su sucursal y quien ve todas las oportunidades, todo. Sin ese permiso, solo lo suyo. Los
 * filtros de agente y sucursal achican el resultado, nunca lo amplían.
 */
export function homeScope(
  actor: Actor,
  filter: { readonly agentId?: string | undefined; readonly branchId?: string | undefined },
): HomeScope {
  return {
    visibility: homeVisibility(actor),
    agentId: filter.agentId,
    branchId: filter.branchId,
  };
}

function homeVisibility(actor: Actor): HomeVisibility {
  const scope = accessScope(actor, OWNERSHIP_RULES.opportunitiesRead);
  if (scope === 'all') return { kind: 'all' };
  if (scope === 'branch' && actor.branchId !== undefined) {
    return { kind: 'branch', ownerId: actor.id, branchId: actor.branchId };
  }
  return { kind: 'own', ownerId: actor.id };
}
