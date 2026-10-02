import type { PageSlice } from '../../../shared';
import type { ClientTagGroupRow, ClientTagRef, ClientTagRow } from '../../contracts';

interface Paging {
  readonly offset: number;
  readonly limit: number;
}

type Direction = 'asc' | 'desc';

/** Lecturas paginadas del catálogo de etiquetas de contactos. SQL en infra. */
export interface ClientTagQuery {
  listGroups(
    criteria: Paging & {
      readonly text: string | undefined;
      readonly sort: { readonly field: 'position' | 'name'; readonly direction: Direction };
    },
  ): Promise<PageSlice<ClientTagGroupRow>>;

  searchTags(
    criteria: Paging & {
      readonly text: string | undefined;
      /** `null`: las etiquetas sin grupo. */
      readonly groupId: string | null | undefined;
      readonly direction: Direction;
    },
  ): Promise<PageSlice<ClientTagRow>>;

  /** Las etiquetas de un contacto (como mucho `MAX_TAGS_PER_CLIENT`), por grupo y nombre. */
  refs(ids: readonly string[]): Promise<ClientTagRef[]>;
}
