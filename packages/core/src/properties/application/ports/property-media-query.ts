import type { PageSlice } from '../../../shared';
import type { PropertyAttachmentRow, PropertyMediaRow } from '../../contracts';

export interface PropertyMediaCriteria {
  readonly propertyId: string;
  /** `images`: fotos y planos. `links`: videos y recorridos. */
  readonly kind: 'images' | 'links' | undefined;
  readonly offset: number;
  readonly limit: number;
}

export interface PropertyAttachmentCriteria {
  readonly propertyId: string;
  readonly sort: { readonly field: 'createdAt' | 'name'; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Listados de la ficha con SQL directo: la galería y los archivos, paginados en la base. */
export interface PropertyMediaQuery {
  listMedia(criteria: PropertyMediaCriteria): Promise<PageSlice<PropertyMediaRow>>;
  /** Sin los borrados. `uploadedBy` viene sin nombre: lo completa el caso de uso. */
  listAttachments(
    criteria: PropertyAttachmentCriteria,
  ): Promise<
    PageSlice<Omit<PropertyAttachmentRow, 'uploadedBy'> & { readonly uploadedBy: string }>
  >;
}
