import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { ReorderPropertyMediaInputSchema, type ReorderPropertyMediaInput } from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

/** El orden tiene que nombrar cada ítem de la galería una vez, ni más ni menos. */
export interface InvalidMediaOrderError {
  readonly type: 'InvalidMediaOrder';
}

export type ReorderPropertyMediaError =
  EditPropertyError | PropertyInTrashError | InvalidMediaOrderError;

/** Reordena la galería arrastrando: recibe el orden completo y renumera las posiciones. */
export class ReorderPropertyMedia {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ReorderPropertyMediaInput,
    actor: Actor,
  ): Promise<Result<void, ReorderPropertyMediaError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ReorderPropertyMediaInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, mediaIds } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReorderPropertyMediaError>> => {
      const property = await loadForEdit(tx, actor, propertyId);
      if (property.isErr()) return err(property.error);
      if (property.value.isDeleted) return err({ type: 'PropertyInTrash' });

      const gallery = await tx.media.listForProperty(property.value.id);
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
          changed = true;
        }
      }
      if (!changed) return ok(undefined);
      await tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.media_reordered', property.value.id),
          diffChanges({ mediaOrder: before }, { mediaOrder: mediaIds }),
        ),
      );
      return ok(undefined);
    });
  }
}
