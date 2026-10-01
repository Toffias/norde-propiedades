import type { PageSlice } from '../../../shared';
import type { FolderCrumb, FolderEntry, TrashedFileRow } from '../../contracts';

export interface CompanyFilesQuery {
  /** Subcarpetas primero y después archivos (sin los de la papelera), con el orden pedido. */
  listFolder(params: {
    readonly folderId: string | undefined;
    readonly offset: number;
    readonly limit: number;
    readonly sort: {
      readonly field: 'name' | 'updatedAt' | 'size';
      readonly direction: 'asc' | 'desc';
    };
  }): Promise<PageSlice<FolderEntry>>;
  listTrash(params: {
    readonly offset: number;
    readonly limit: number;
    readonly sort: { readonly field: 'deletedAt' | 'name'; readonly direction: 'asc' | 'desc' };
  }): Promise<PageSlice<TrashedFileRow>>;
  /** Las carpetas de la ruta, desde la raíz hasta la pedida (vacío si no existe). */
  breadcrumb(folderId: string): Promise<FolderCrumb[]>;
}
