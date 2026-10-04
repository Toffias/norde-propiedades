import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateAppraisalInputSchema, type CreateAppraisalInput } from '../../contracts';
import {
  Appraisal,
  appraisalCode,
  type InvalidAppraisalDetailsError,
} from '../../domain/appraisal';
import {
  appraisalAuditState,
  appraisalTarget,
  buildDetails,
  invalidInput,
  type AppraiserNotFoundError,
  type InvalidInputError,
  type ProducerNotFoundError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';
import type { ActiveUsers } from '../ports/panel-directory';

export type CreateAppraisalError =
  | ForbiddenError
  | InvalidInputError
  | ProducerNotFoundError
  | AppraiserNotFoundError
  | InvalidAppraisalDetailsError;

/** Carga una tasación pedida por un cliente propietario, con `appraisals:create`. Nace solicitada. */
export class CreateAppraisal {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly users: ActiveUsers;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: CreateAppraisalInput,
    actor: Actor,
  ): Promise<
    Result<{ readonly appraisalId: string; readonly code: string }, CreateAppraisalError>
  > {
    if (!actor.can('appraisals:create')) return err({ type: 'Forbidden' });
    const parsed = CreateAppraisalInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const details = await buildDetails(this.deps.users, actor, parsed.data);
    if (details.isErr()) return err(details.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<
        Result<{ readonly appraisalId: string; readonly code: string }, CreateAppraisalError>
      > => {
        const code = appraisalCode(await tx.codes.next());
        const created = Appraisal.create({
          ...details.value,
          id: nextId<'Appraisal'>(this.deps.ids),
          code,
          source: 'manual',
          now,
        });
        if (created.isErr()) return err(created.error);
        const appraisal = created.value;

        await tx.appraisals.insert(appraisal, actor.id);
        await tx.events.publish(appraisal.pullEvents());
        await tx.audit.record(
          auditCreated(
            actor,
            appraisalTarget('appraisal.created', appraisal),
            appraisalAuditState(appraisal),
          ),
        );
        return ok({ appraisalId: appraisal.id, code });
      },
    );
  }
}
