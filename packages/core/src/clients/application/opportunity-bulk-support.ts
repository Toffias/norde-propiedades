import { accessScope, canActOn, OWNERSHIP_RULES } from '../../identity';
import { err, ok, type Actor, type IdGenerator, type Result } from '../../shared';
import type { OpportunityBulkActionSchema, OpportunityBulkFilterSchema } from '../contracts';
import type {
  OpportunityBulkBatch,
  OpportunityBulkSkipped,
  OpportunityBulkSkipReason,
} from '../domain/opportunity-bulk-operation';
import type {
  CloseReasonInactiveError,
  CloseRequiresReasonError,
  OpportunityAgent,
  StageInactiveError,
} from '../domain/opportunity';
import type { CloseReasonRef } from '../domain/opportunity-close-reason';
import { closingStatusFor } from '../domain/opportunity-close-reason';
import { firstActiveStageOf, type StageRef } from '../domain/opportunity-stage';
import { isOpenStatus } from '../domain/opportunity-status';

import { resolveAgent, type AgentNotFoundError } from './client-support';
import {
  findCloseReason,
  findStage,
  type CloseReasonNotFoundError,
  type OpportunityStageNotFoundError,
} from './opportunity-config-support';
import {
  canReassignOpportunity,
  canUpdateOpportunity,
  closeOpportunityWith,
  findOpportunity,
  moveOpportunity,
  reassignOpportunityTo,
  resolveOpportunityFilter,
} from './opportunity-support';
import type { ClientAgents } from './ports/client-agents';
import type { ClientsTransaction, ClientsUnitOfWork } from './ports/clients-transaction';
import type { OpportunityBulkCriteria } from './ports/opportunity-pipeline-query';
import type { z } from 'zod';

// Lo que comparten la acción masiva en el request y el job que procesa las encoladas.

/** Cuántas se procesan por transacción: un error en un lote no deshace los anteriores. */
export const BULK_BATCH_SIZE = 100;

type ParsedAction = z.output<typeof OpportunityBulkActionSchema>;
type ParsedFilter = z.output<typeof OpportunityBulkFilterSchema>;

/** La acción con lo que necesita ya buscado: el estado, el motivo y su estado, o el agente. */
export type ResolvedBulkAction =
  | { readonly kind: 'change_stage'; readonly stage: StageRef }
  | { readonly kind: 'close'; readonly reason: CloseReasonRef; readonly stage: StageRef }
  | { readonly kind: 'reassign'; readonly agent: OpportunityAgent };

export type ResolveBulkActionError =
  | OpportunityStageNotFoundError
  | StageInactiveError
  | CloseRequiresReasonError
  | CloseReasonNotFoundError
  | CloseReasonInactiveError
  | AgentNotFoundError;

/** Cambiar el estado o cerrar pide poder editar al menos las suyas; reasignar, su permiso. */
export function canRunBulkAction(actor: Actor, kind: ParsedAction['kind']): boolean {
  return kind === 'reassign'
    ? actor.can('opportunities:reassign')
    : accessScope(actor, OWNERSHIP_RULES.opportunitiesUpdate) !== undefined;
}

/** Busca el estado, el motivo o el agente de la acción, que valen para toda la selección. */
export async function resolveBulkAction(
  deps: { readonly uow: ClientsUnitOfWork; readonly agents: ClientAgents },
  action: ParsedAction,
): Promise<Result<ResolvedBulkAction, ResolveBulkActionError>> {
  switch (action.kind) {
    case 'change_stage': {
      const stage = await deps.uow.run((tx) => findStage(tx, action.stageId));
      if (!stage) return err({ type: 'StageNotFound' });
      if (!stage.isActive) return err({ type: 'StageInactive' });
      // A ganada o perdida se llega cerrando, con un motivo.
      if (!isOpenStatus(stage.category)) return err({ type: 'CloseRequiresReason' });
      return ok({ kind: 'change_stage', stage: stage.ref() });
    }
    case 'close': {
      const found = await deps.uow.run(async (tx) => {
        const reason = await findCloseReason(tx, action.closeReasonId);
        if (!reason) return undefined;
        const stages = await tx.stages.findAll();
        return { reason, stage: firstActiveStageOf(stages, closingStatusFor(reason.rating)) };
      });
      if (!found) return err({ type: 'CloseReasonNotFound' });
      if (!found.reason.isActive) return err({ type: 'CloseReasonInactive' });
      if (!found.stage) return err({ type: 'StageNotFound' });
      return ok({ kind: 'close', reason: found.reason.ref(), stage: found.stage.ref() });
    }
    case 'reassign': {
      const agent = await resolveAgent(deps.agents, action.agentId ?? undefined);
      if (agent.isErr()) return err(agent.error);
      return ok({ kind: 'reassign', agent: agent.value });
    }
  }
}

/** Los filtros de "todas las que cumplen", con la visibilidad del actor. */
export function bulkCriteria(filter: ParsedFilter, actor: Actor): OpportunityBulkCriteria {
  return { ...resolveOpportunityFilter(filter, actor), stageId: filter.stageId };
}

/**
 * Aplica la acción a cada oportunidad del lote, en la transacción. Cada una se chequea por
 * separado: la que el actor no ve, no puede cambiar o el dominio no deja, se saltea con el motivo.
 * Cada cambio queda en el historial y la auditoría de su oportunidad.
 */
export async function applyBulkBatch(
  tx: ClientsTransaction,
  opportunityIds: readonly string[],
  action: ResolvedBulkAction,
  actor: Actor,
  context: { readonly ids: IdGenerator; readonly now: Date },
): Promise<OpportunityBulkBatch> {
  let updated = 0;
  let unchanged = 0;
  const skipped: OpportunityBulkSkipped[] = [];
  const skip = (opportunityId: string, reason: OpportunityBulkSkipReason) => {
    skipped.push({ opportunityId, reason });
  };

  for (const id of opportunityIds) {
    const opportunity = await findOpportunity(tx, id);
    if (
      !opportunity ||
      !canActOn(actor, OWNERSHIP_RULES.opportunitiesRead, opportunity.ownership)
    ) {
      skip(id, 'not_found');
      continue;
    }
    const allowed =
      action.kind === 'reassign'
        ? canReassignOpportunity(actor, opportunity.ownership)
        : canUpdateOpportunity(actor, opportunity.ownership);
    if (!allowed) {
      skip(id, 'forbidden');
      continue;
    }

    const outcome = await applyOne(tx, opportunity, action, actor, context);
    if (outcome === 'updated') updated += 1;
    else if (outcome === 'unchanged') unchanged += 1;
    else skip(id, outcome);
  }

  return {
    processed: opportunityIds.length,
    updated,
    unchanged,
    skipped,
    lastId: opportunityIds.at(-1),
  };
}

async function applyOne(
  tx: ClientsTransaction,
  opportunity: NonNullable<Awaited<ReturnType<typeof findOpportunity>>>,
  action: ResolvedBulkAction,
  actor: Actor,
  context: { readonly ids: IdGenerator; readonly now: Date },
): Promise<'updated' | 'unchanged' | OpportunityBulkSkipReason> {
  switch (action.kind) {
    case 'change_stage': {
      const moved = await moveOpportunity(tx, opportunity, action.stage, actor, context);
      if (moved.isErr())
        return moved.error.type === 'OpportunityClosed' ? 'closed' : 'invalid_transition';
      return moved.value ? 'updated' : 'unchanged';
    }
    case 'close': {
      const closed = await closeOpportunityWith(tx, opportunity, action, actor, context);
      if (closed.isErr()) {
        return closed.error.type === 'OpportunityClosed' ? 'closed' : 'invalid_transition';
      }
      return 'updated';
    }
    case 'reassign': {
      const changed = await reassignOpportunityTo(
        tx,
        opportunity,
        action.agent,
        actor,
        context.now,
      );
      if (changed.isErr()) return 'closed';
      return changed.value ? 'updated' : 'unchanged';
    }
  }
}
