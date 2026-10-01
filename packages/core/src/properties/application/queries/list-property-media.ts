import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListPropertyMediaQuerySchema,
  type ListPropertyMediaQuery,
  type PropertyMediaRow,
} from '../../contracts';
import type { PropertyMediaQuery } from '../ports/property-media-query';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListPropertyMediaError = ForbiddenError | InvalidInputError;

/** La galería de la ficha, en el orden elegido, paginada en la base. */
export class ListPropertyMedia {
  constructor(private readonly deps: { readonly media: PropertyMediaQuery }) {}

  async execute(
    input: ListPropertyMediaQuery,
    actor: Actor,
  ): Promise<Result<Page<PropertyMediaRow>, ListPropertyMediaError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListPropertyMediaQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, kind, page, pageSize } = parsed.data;
    const slice = await this.deps.media.listMedia({
      propertyId,
      kind,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
