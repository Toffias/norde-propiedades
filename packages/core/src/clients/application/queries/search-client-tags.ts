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
  NO_CLIENT_TAG_GROUP,
  SearchClientTagsQuerySchema,
  type ClientTagRow,
  type SearchClientTagsQuery,
} from '../../contracts';
import { canReadClients, invalidInput, type InvalidInputError } from '../client-support';
import type { ClientTagQuery } from '../ports/client-tag-query';

export type SearchClientTagsError = ForbiddenError | InvalidInputError;

/**
 * Etiquetas de contactos por nombre o por grupo, con cuántos contactos la tienen. La usan la
 * pantalla de etiquetas, el filtro de la agenda y el selector de la ficha.
 */
export class SearchClientTags {
  constructor(private readonly deps: { readonly tags: ClientTagQuery }) {}

  async execute(
    input: SearchClientTagsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientTagRow>, SearchClientTagsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = SearchClientTagsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.tags.searchTags({
      text: query.q,
      groupId: query.group === NO_CLIENT_TAG_GROUP ? null : query.group,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
