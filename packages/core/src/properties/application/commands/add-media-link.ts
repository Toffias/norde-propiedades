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
import { AddMediaLinkInputSchema, type AddMediaLinkInput } from '../../contracts';
import { MAX_MEDIA_PER_OWNER, MediaItem, type InvalidMediaUrlError } from '../../domain/media-item';
import {
  canEditMedia,
  childState,
  loadActiveOwner,
  mediaAuditState,
  ownerTarget,
  type EditMediaError,
  type TooManyMediaError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type AddMediaLinkError = EditMediaError | InvalidMediaUrlError | TooManyMediaError;

/** Suma un video (YouTube, Vimeo) o un recorrido 360 (Matterport, Kuula) a la galería. */
export class AddMediaLink {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AddMediaLinkInput,
    actor: Actor,
  ): Promise<Result<{ readonly mediaId: string }, AddMediaLinkError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = AddMediaLinkInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { kind, url } = parsed.data;

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly mediaId: string }, AddMediaLinkError>> => {
        const owner = await loadActiveOwner(tx, actor, parsed.data.owner);
        if (owner.isErr()) return err(owner.error);
        if ((await tx.media.count(owner.value)) >= MAX_MEDIA_PER_OWNER) {
          return err({ type: 'TooManyMedia', max: MAX_MEDIA_PER_OWNER });
        }
        const linked = MediaItem.link({
          id: nextId<'MediaItem'>(this.deps.ids),
          owner: owner.value,
          kind,
          url,
          position: await tx.media.nextPosition(owner.value),
          uploadedBy: actor.id,
          now: this.deps.clock.now(),
        });
        if (linked.isErr()) return err(linked.error);
        const item = linked.value;

        await tx.media.save(item, actor.id);
        await tx.audit.record(
          auditAction(
            actor,
            ownerTarget('media_added', owner.value),
            diffChanges({}, childState(`media.${item.id}`, mediaAuditState(item))),
          ),
        );
        return ok({ mediaId: item.id });
      },
    );
  }
}
