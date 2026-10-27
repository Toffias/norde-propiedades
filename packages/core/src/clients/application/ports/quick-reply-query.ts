import type { PageSlice } from '../../../shared';
import type { QuickReplySnapshot } from '../../domain/quick-reply';

export interface QuickReplyCriteria {
  readonly active: boolean;
  /** Contiene el texto en el nombre, sin acentos ni mayúsculas. */
  readonly text: string | undefined;
  readonly direction: 'asc' | 'desc';
  readonly offset: number;
  readonly limit: number;
}

/** Las respuestas rápidas activas o las inactivas, por nombre. */
export interface QuickReplyQuery {
  search(criteria: QuickReplyCriteria): Promise<PageSlice<QuickReplySnapshot>>;
}
