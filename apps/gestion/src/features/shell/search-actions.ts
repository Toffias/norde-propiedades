'use server';

import type { GlobalSearchError } from '@norde/core/reporting';
import {
  GlobalSearchQuerySchema,
  type GlobalSearchQuery,
  type GlobalSearchResult,
} from '@norde/core/reporting/contracts';

import { getContainer } from '../../container';
import { messageForError, type ErrorMessages } from '../../lib/errors';
import { requireSession } from '../../lib/session';

const GLOBAL_SEARCH_ERROR_MESSAGES = {
  InvalidInput: 'Escribí al menos dos letras para buscar.',
} satisfies ErrorMessages<GlobalSearchError>;

/** Buscador de la barra superior: los primeros resultados de cada tipo elegido. */
export async function globalSearchAction(
  query: GlobalSearchQuery,
): Promise<
  | { readonly ok: true; readonly value: GlobalSearchResult }
  | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = GlobalSearchQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, message: GLOBAL_SEARCH_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().search.globalSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, GLOBAL_SEARCH_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}
