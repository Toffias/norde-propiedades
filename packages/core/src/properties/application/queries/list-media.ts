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
import { ListMediaQuerySchema, type ListMediaQuery, type MediaRow } from '../../contracts';
import { canReadMedia, toMediaOwner, type MediaOwnerReadError } from '../media-support';
import type { MediaQuery } from '../ports/media-query';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListMediaError = ForbiddenError | InvalidInputError | MediaOwnerReadError;

/** La galería de una propiedad o un emprendimiento, en el orden elegido, paginada en la base. */
export class ListMedia {
  constructor(private readonly deps: { readonly media: MediaQuery }) {}

  async execute(
    input: ListMediaQuery,
    actor: Actor,
  ): Promise<Result<Page<MediaRow>, ListMediaError>> {
    const parsed = ListMediaQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { kind, page, pageSize } = parsed.data;
    if (!canReadMedia(actor, parsed.data.owner.kind)) return err({ type: 'Forbidden' });
    const owner = toMediaOwner(parsed.data.owner);
    if (owner.isErr()) return err(owner.error);
    const slice = await this.deps.media.listMedia({
      owner: owner.value,
      kind,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
