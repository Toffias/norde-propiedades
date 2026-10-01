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
  ListPropertyAttachmentsQuerySchema,
  type ListPropertyAttachmentsQuery,
  type PropertyAttachmentRow,
} from '../../contracts';
import type { PropertyMediaQuery } from '../ports/property-media-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListPropertyAttachmentsError = ForbiddenError | InvalidInputError;

/** Los archivos de la ficha, con quién los subió, paginados en la base. */
export class ListPropertyAttachments {
  constructor(
    private readonly deps: { readonly media: PropertyMediaQuery; readonly users: UserNames },
  ) {}

  async execute(
    input: ListPropertyAttachmentsQuery,
    actor: Actor,
  ): Promise<Result<Page<PropertyAttachmentRow>, ListPropertyAttachmentsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListPropertyAttachmentsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, sort, page, pageSize } = parsed.data;
    const slice = await this.deps.media.listAttachments({
      propertyId,
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
