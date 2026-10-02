import type { PageSlice } from '../../../shared';
import type { ClientImportSnapshot, ImportRowProblem } from '../../domain/client-import';

export type ClientImportItem = Omit<ClientImportSnapshot, 'storageKey' | 'mapping' | 'updatedAt'>;

/** El historial de importaciones de contactos y las filas que no se importaron. */
export interface ClientImportQuery {
  /** Las más recientes primero (o al revés). */
  list(query: {
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ClientImportItem>>;
  find(importId: string): Promise<ClientImportItem | undefined>;
  /** Por número de fila. */
  problems(query: {
    readonly importId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ImportRowProblem>>;
}
