import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { AddPropertyMediaLinkInputSchema, type AddPropertyMediaLinkInput } from '../../contracts';
import {
  MAX_MEDIA_PER_PROPERTY,
  MediaItem,
  type InvalidMediaUrlError,
} from '../../domain/media-item';
import type { PropertyInTrashError } from '../../domain/property';
import { childState, mediaAuditState, type TooManyMediaError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type AddPropertyMediaLinkError =
  EditPropertyError | PropertyInTrashError | InvalidMediaUrlError | TooManyMediaError;

/** Suma un video (YouTube, Vimeo) o un recorrido 360 (Matterport, Kuula) a la galería. */
export class AddPropertyMediaLink {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AddPropertyMediaLinkInput,
    actor: Actor,
  ): Promise<Result<{ readonly mediaId: string }, AddPropertyMediaLinkError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = AddPropertyMediaLinkInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, kind, url } = parsed.data;

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly mediaId: string }, AddPropertyMediaLinkError>> => {
        const property = await loadForEdit(tx, actor, propertyId);
        if (property.isErr()) return err(property.error);
        if (property.value.isDeleted) return err({ type: 'PropertyInTrash' });
        if ((await tx.media.count(property.value.id)) >= MAX_MEDIA_PER_PROPERTY) {
          return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_PROPERTY });
        }
        const linked = MediaItem.link({
          id: nextId<'MediaItem'>(this.deps.ids),
          propertyId: property.value.id,
          kind,
          url,
          position: await tx.media.nextPosition(property.value.id),
          uploadedBy: actor.id,
          now: this.deps.clock.now(),
        });
        if (linked.isErr()) return err(linked.error);
        const item = linked.value;

        await tx.media.save(item, actor.id);
        await tx.audit.record(
          auditAction(
            actor,
            propertyTarget('property.media_added', property.value.id),
            diffChanges({}, childState(`media.${item.id}`, mediaAuditState(item))),
          ),
        );
        return ok({ mediaId: item.id });
      },
    );
  }
}
