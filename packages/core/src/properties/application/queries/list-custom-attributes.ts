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
  ListCustomAttributesQuerySchema,
  type CustomAttributeRow,
  type ListCustomAttributesQuery,
} from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListCustomAttributesError = ForbiddenError | InvalidInputError;

/** Los atributos personalizados de Mi empresa, activos y desactivados, paginados en la base. */
export class ListCustomAttributes {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: ListCustomAttributesQuery,
    actor: Actor,
  ): Promise<Result<Page<CustomAttributeRow>, ListCustomAttributesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListCustomAttributesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort } = parsed.data;
    const slice = await this.deps.catalog.listCustomAttributes({
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
