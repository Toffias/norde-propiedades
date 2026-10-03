import type { PageSlice } from '../../../shared';
import type { AttachmentRow, MediaRow } from '../../contracts';
import type { MediaOwner } from '../../domain/media-owner';

export interface MediaCriteria {
  readonly owner: MediaOwner;
  /** `images`: fotos y planos. `links`: videos y recorridos. */
  readonly kind: 'images' | 'links' | undefined;
  readonly offset: number;
  readonly limit: number;
}

export interface AttachmentCriteria {
  readonly owner: MediaOwner;
  readonly sort: { readonly field: 'createdAt' | 'name'; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Listados de la ficha con SQL directo: la galería y los archivos, paginados en la base. */
export interface MediaQuery {
  listMedia(criteria: MediaCriteria): Promise<PageSlice<MediaRow>>;
  /** Sin los borrados. `uploadedBy` viene sin nombre: lo completa el caso de uso. */
  listAttachments(
    criteria: AttachmentCriteria,
  ): Promise<PageSlice<Omit<AttachmentRow, 'uploadedBy'> & { readonly uploadedBy: string }>>;
}
