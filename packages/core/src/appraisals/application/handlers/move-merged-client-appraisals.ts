import {
  auditAction,
  err,
  MergedClientInputSchema,
  ok,
  type Actor,
  type ForbiddenError,
  type MergedClientInput,
  type Result,
} from '../../../shared';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export interface InvalidMergeInputError {
  readonly type: 'InvalidInput';
}

export type MoveMergedClientAppraisalsError = ForbiddenError | InvalidMergeInputError;

/**
 * Reacción a `clients.clients_merged`: las tasaciones pedidas por el duplicado pasan al contacto que
 * queda. Cada una lo deja en su historial, con los dos IDs. Idempotente: una segunda vez no
 * encuentra nada que mover.
 */
export class MoveMergedClientAppraisals {
  constructor(private readonly deps: { readonly uow: AppraisalsUnitOfWork }) {}

  async execute(
    input: MergedClientInput,
    actor: Actor,
  ): Promise<Result<{ readonly moved: number }, MoveMergedClientAppraisalsError>> {
    if (!actor.can('appraisals:merge-client-data')) return err({ type: 'Forbidden' });
    const parsed = MergedClientInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientId, mergedClientId } = parsed.data;

    const moved = await this.deps.uow.run(async (tx) => {
      const appraisalIds = await tx.appraisals.moveRequester(mergedClientId, clientId);
      for (const appraisalId of appraisalIds) {
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'appraisal.client_merged',
              entityType: 'appraisal',
              entityId: appraisalId,
              clientIds: [clientId, mergedClientId],
            },
            { requesterClientId: { before: mergedClientId, after: clientId } },
          ),
        );
      }
      return appraisalIds.length;
    });
    return ok({ moved });
  }
}
