import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { AppraisalIdInputSchema, type AppraisalIdInput } from '../../contracts';
import type {
  AppraisalConvertedError,
  AppraisalDeletedError,
  AppraisalNotAppraisedError,
} from '../../domain/appraisal';
import {
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type ConvertAppraisalToListingError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError
  | AppraisalNotAppraisedError;

/**
 * Convierte una tasación tasada en una captación, con `appraisals:update` y `properties:create`.
 * La tasación queda "convertida" con el ID de la propiedad nueva; properties crea el borrador al
 * recibir `AppraisalConverted` (datos de la propiedad, propietario, productor, tasador, precio y
 * fotos). Convertirla dos veces da `AppraisalConverted`.
 */
export class ConvertAppraisalToListing {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AppraisalIdInput,
    actor: Actor,
  ): Promise<Result<{ readonly propertyId: string }, ConvertAppraisalToListingError>> {
    if (!actor.can('appraisals:update') || !actor.can('properties:create')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = AppraisalIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<{ readonly propertyId: string }, ConvertAppraisalToListingError>> => {
        const loaded = await loadAppraisalForChange(
          tx,
          actor,
          'appraisals:update',
          parsed.data.appraisalId,
        );
        if (loaded.isErr()) return err(loaded.error);
        const appraisal = loaded.value;

        const before = { status: appraisal.status, convertedPropertyId: undefined };
        const propertyId = nextId<'Property'>(this.deps.ids);
        const photos = await tx.photos.listByAppraisal(appraisal.id);
        const converted = appraisal.convert(
          { propertyId, photoKeys: photos.map((photo) => photo.storageKey) },
          now,
        );
        if (converted.isErr()) return err(converted.error);

        await tx.appraisals.save(appraisal, actor.id);
        await tx.events.publish(appraisal.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            appraisalTarget('appraisal.converted', appraisal),
            diffChanges(before, {
              status: appraisal.status,
              convertedPropertyId: appraisal.convertedPropertyId,
            }),
          ),
        );
        return ok({ propertyId });
      },
    );
  }
}
