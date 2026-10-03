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
  ListAttachmentsQuerySchema,
  type ListAttachmentsQuery,
  type AttachmentRow,
} from '../../contracts';
import { canReadMedia, toMediaOwner, type MediaOwnerReadError } from '../media-support';
import type { MediaQuery } from '../ports/media-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListAttachmentsError = ForbiddenError | InvalidInputError | MediaOwnerReadError;

/** Los archivos de la ficha, con quién los subió, paginados en la base. */
export class ListAttachments {
  constructor(private readonly deps: { readonly media: MediaQuery; readonly users: UserNames }) {}

  async execute(
    input: ListAttachmentsQuery,
    actor: Actor,
  ): Promise<Result<Page<AttachmentRow>, ListAttachmentsError>> {
    const parsed = ListAttachmentsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { sort, page, pageSize } = parsed.data;
    if (!canReadMedia(actor, parsed.data.owner.kind)) return err({ type: 'Forbidden' });
    const owner = toMediaOwner(parsed.data.owner);
    if (owner.isErr()) return err(owner.error);
    const slice = await this.deps.media.listAttachments({
      owner: owner.value,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.users.names([...new Set(slice.items.map((i) => i.uploadedBy))]);
    const items = slice.items.map((item) => ({
      ...item,
      uploadedBy: { id: item.uploadedBy, name: names.get(item.uploadedBy) },
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
