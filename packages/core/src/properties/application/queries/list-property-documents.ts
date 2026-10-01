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
  ListPropertyDocumentsQuerySchema,
  type ListPropertyDocumentsQuery,
  type PropertyDocumentRow,
} from '../../contracts';
import type { PropertyDocumentQuery } from '../ports/property-documents';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListPropertyDocumentsError = ForbiddenError | InvalidInputError;

/** Los PDF pedidos de la ficha, con su estado, del más nuevo al más viejo. */
export class ListPropertyDocuments {
  constructor(
    private readonly deps: { readonly documents: PropertyDocumentQuery; readonly users: UserNames },
  ) {}

  async execute(
    input: ListPropertyDocumentsQuery,
    actor: Actor,
  ): Promise<Result<Page<PropertyDocumentRow>, ListPropertyDocumentsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListPropertyDocumentsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, page, pageSize } = parsed.data;
    const slice = await this.deps.documents.list({
      propertyId,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.users.names([...new Set(slice.items.map((i) => i.requestedBy))]);
    const items = slice.items.map((item) => ({
      ...item,
      requestedBy: { id: item.requestedBy, name: names.get(item.requestedBy) },
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
