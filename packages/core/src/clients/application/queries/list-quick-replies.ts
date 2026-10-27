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
  ListQuickRepliesQuerySchema,
  type ListQuickRepliesQuery,
  type QuickReplyRow,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { QuickReplyQuery } from '../ports/quick-reply-query';
import { canManageQuickReplies, canUseQuickReplies, toQuickReplyRow } from '../quick-reply-support';

export type ListQuickRepliesError = ForbiddenError | InvalidInputError;

/**
 * Las respuestas rápidas por nombre, paginadas: para administrarlas (`quick-replies:manage`, activas
 * o inactivas) o para elegir una al enviar (solo las activas).
 */
export class ListQuickReplies {
  constructor(private readonly deps: { readonly replies: QuickReplyQuery }) {}

  async execute(
    input: ListQuickRepliesQuery,
    actor: Actor,
  ): Promise<Result<Page<QuickReplyRow>, ListQuickRepliesError>> {
    if (!canUseQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = ListQuickRepliesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, status, q, sort } = parsed.data;
    if (status === 'inactive' && !canManageQuickReplies(actor)) return err({ type: 'Forbidden' });

    const slice = await this.deps.replies.search({
      active: status === 'active',
      text: q === undefined || q === '' ? undefined : q,
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(
      toPage({ items: slice.items.map(toQuickReplyRow), total: slice.total }, { page, pageSize }),
    );
  }
}
