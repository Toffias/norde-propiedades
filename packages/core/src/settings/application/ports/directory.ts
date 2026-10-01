import type { PageSlice } from '../../../shared';
import type { DirectoryEntry, DirectoryScope } from '../../contracts';

/**
 * Usuarios, equipos y sucursales para elegir a quién aplica un prefijo exclusivo. Solo lectura:
 * el ABM de cada uno vive en identity.
 */
export interface Directory {
  search(params: {
    readonly kind: DirectoryScope;
    readonly search: string | undefined;
    readonly offset: number;
    readonly limit: number;
    readonly direction: 'asc' | 'desc';
  }): Promise<PageSlice<DirectoryEntry>>;
  /** Nombres de los IDs pedidos (como mucho, una página). Los que no existen no vuelven. */
  names(kind: DirectoryScope, ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
