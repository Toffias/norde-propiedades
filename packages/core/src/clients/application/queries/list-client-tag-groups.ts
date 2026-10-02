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
  ListClientTagGroupsQuerySchema,
  type ClientTagGroupRow,
  type ListClientTagGroupsQuery,
} from '../../contracts';
import { canReadClients, invalidInput, type InvalidInputError } from '../client-support';
import type { ClientTagQuery } from '../ports/client-tag-query';

export type ListClientTagGroupsError = ForbiddenError | InvalidInputError;

/** Grupos de etiquetas de contactos, con cuántas etiquetas y cuántos contactos tiene cada uno. */
export class ListClientTagGroups {
  constructor(private readonly deps: { readonly tags: ClientTagQuery }) {}

  async execute(
    input: ListClientTagGroupsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientTagGroupRow>, ListClientTagGroupsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientTagGroupsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.tags.listGroups({
      text: query.q,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
