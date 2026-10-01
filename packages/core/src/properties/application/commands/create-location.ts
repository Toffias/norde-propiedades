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
import { CreateLocationInputSchema, type CreateLocationInput } from '../../contracts';
import { Location, type LocationParent, type LocationTooDeepError } from '../../domain/location';
import {
  catalogTarget,
  idOf,
  locationAuditState,
  type LocationNameTakenError,
  type LocationNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type CreateLocationError =
  | ForbiddenError
  | InvalidInputError
  | LocationNotFoundError
  | LocationNameTakenError
  | LocationTooDeepError;

/** Suma una ubicación al catálogo, debajo de su padre (sin padre, un país). */
export class CreateLocation {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateLocationInput,
    actor: Actor,
  ): Promise<Result<{ readonly locationId: string }, CreateLocationError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = CreateLocationInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { parentId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly locationId: string }, CreateLocationError>> => {
        let parent: LocationParent | undefined;
        if (parentId !== undefined) {
          const id = idOf<'Location'>(parentId);
          const found = id === undefined ? undefined : await tx.locations.findById(id);
          if (!found) return err({ type: 'LocationNotFound' });
          const s = found.toSnapshot();
          parent = { id: s.id, kind: s.kind, path: s.path };
        }
        if (await tx.locations.findSibling(parent?.id, name)) {
          return err({ type: 'LocationNameTaken' });
        }

        const created = Location.create({
          id: nextId<'Location'>(this.deps.ids),
          name,
          parent,
          now,
        });
        if (created.isErr()) return err(created.error);
        const location = created.value;

        await tx.locations.save(location, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('location', 'location.created', location.id),
            locationAuditState(location),
          ),
        );
        return ok({ locationId: location.id });
      },
    );
  }
}
