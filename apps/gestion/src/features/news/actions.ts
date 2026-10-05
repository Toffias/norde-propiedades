'use server';

import {
  NewsFeedQuerySchema,
  type ListNewsQuery,
  type NewsCard,
} from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { NEWS_ERROR_MESSAGES } from './messages';

/** La tanda siguiente del feed (scroll infinito). */
export async function loadNewsPageAction(
  query: ListNewsQuery,
): Promise<
  | { readonly ok: true; readonly value: Page<NewsCard> }
  | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = NewsFeedQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, message: NEWS_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().news.listNews.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, NEWS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}
