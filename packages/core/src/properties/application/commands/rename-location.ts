import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RenameLocationInputSchema, type RenameLocationInput } from '../../contracts';
import {
  catalogTarget,
  idOf,
  locationAuditState,
  type LocationNameTakenError,
  type LocationNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type RenameLocationError =
  ForbiddenError | InvalidInputError | LocationNotFoundError | LocationNameTakenError;

/**
 * Corrige el nombre de una ubicación. Las propiedades guardan barrio, localidad y provincia en
 * texto al darse de alta: el cambio se ve en las nuevas, no en las que ya existen.
 */
export class RenameLocation {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: RenameLocationInput,
    actor: Actor,
  ): Promise<Result<void, RenameLocationError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = RenameLocationInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { locationId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RenameLocationError>> => {
      const id = idOf<'Location'>(locationId);
      const location = id === undefined ? undefined : await tx.locations.findById(id);
      if (!location) return err({ type: 'LocationNotFound' });
      const sibling = await tx.locations.findSibling(location.parentId, name);
      if (sibling && sibling.id !== location.id) return err({ type: 'LocationNameTaken' });

      const before = locationAuditState(location);
      location.rename(name, now);
      const entry = auditUpdated(
        actor,
        catalogTarget('location', 'location.updated', location.id),
        before,
        locationAuditState(location),
      );
      if (!entry) return ok(undefined);

      await tx.locations.save(location, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
