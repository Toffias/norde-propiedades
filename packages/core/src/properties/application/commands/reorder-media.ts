import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { ReorderMediaInputSchema, type ReorderMediaInput } from '../../contracts';
import { canEditMedia, loadActiveOwner, ownerTarget, type EditMediaError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

/** El orden tiene que nombrar cada ítem de la galería una vez, ni más ni menos. */
export interface InvalidMediaOrderError {
  readonly type: 'InvalidMediaOrder';
}

export type ReorderMediaError = EditMediaError | InvalidMediaOrderError;

/** Reordena la galería arrastrando: recibe el orden completo y renumera las posiciones. */
export class ReorderMedia {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: ReorderMediaInput, actor: Actor): Promise<Result<void, ReorderMediaError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = ReorderMediaInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { mediaIds } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReorderMediaError>> => {
      const owner = await loadActiveOwner(tx, actor, parsed.data.owner);
      if (owner.isErr()) return err(owner.error);

      const gallery = await tx.media.listForOwner(owner.value);
      const byId = new Map<string, (typeof gallery)[number]>(
        gallery.map((item) => [item.id, item]),
      );
      if (
        new Set(mediaIds).size !== mediaIds.length ||
        mediaIds.length !== gallery.length ||
        mediaIds.some((id) => !byId.has(id))
      ) {
        return err({ type: 'InvalidMediaOrder' });
      }

      const before = gallery.map((item): string => item.id);
      let changed = false;
      for (const [position, id] of mediaIds.entries()) {
        const item = byId.get(id);
        if (item?.moveTo(position, now)) {
          await tx.media.save(item, actor.id);
          await tx.events.publish(item.pullEvents());
          changed = true;
        }
      }
      if (!changed) return ok(undefined);
      await tx.audit.record(
        auditAction(
          actor,
          ownerTarget('media_reordered', owner.value),
          diffChanges({ mediaOrder: before }, { mediaOrder: mediaIds }),
        ),
      );
      return ok(undefined);
    });
  }
}
