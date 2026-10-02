import { closingStatusFor, type CloseReasonRef } from './opportunity-close-reason';
import type { StageRef } from './opportunity-stage';
import { canTransition, isOpenStatus, type OpportunityStatus } from './opportunity-status';

/** Dónde está la oportunidad. */
export interface StagePosition {
  /** Sin estado: las anteriores al backfill. */
  readonly stageId: string | undefined;
  readonly status: OpportunityStatus;
}

/**
 * Los estados a los que se puede pasar sin cerrar (`moveToStage`), en el orden recibido: activos,
 * de una categoría abierta, distintos del actual, y de la misma categoría o de una a la que el
 * dominio deja pasar. Una cerrada no se mueve.
 */
export function reachableStages<T extends StageRef>(
  current: StagePosition,
  stages: readonly T[],
): T[] {
  if (!isOpenStatus(current.status)) return [];
  return stages.filter(
    (stage) =>
      stage.isActive &&
      stage.id !== current.stageId &&
      isOpenStatus(stage.category) &&
      (stage.category === current.status || canTransition(current.status, stage.category)),
  );
}

/**
 * Los motivos con los que se puede cerrar (`close`): activos, que lleven a una categoría (ganada o
 * perdida) a la que se puede pasar desde la actual, y con algún estado activo de esa categoría.
 */
export function usableCloseReasons<T extends CloseReasonRef>(
  status: OpportunityStatus,
  reasons: readonly T[],
  stages: readonly StageRef[],
): T[] {
  if (!isOpenStatus(status)) return [];
  return reasons.filter((reason) => {
    const target = closingStatusFor(reason.rating);
    return (
      reason.isActive &&
      canTransition(status, target) &&
      stages.some((stage) => stage.isActive && stage.category === target)
    );
  });
}
