import type { PageSlice } from '../../../shared';
import type {
  PropertyImportRowProblem,
  PropertyImportSnapshot,
} from '../../domain/property-import';

export type PropertyImportItem = Omit<
  PropertyImportSnapshot,
  'storageKey' | 'columns' | 'updatedAt'
>;

/** El historial de importaciones de propiedades y las filas con problemas. */
export interface PropertyImportQuery {
  /** Las más recientes primero (o al revés). */
  list(query: {
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<PropertyImportItem>>;
  find(importId: string): Promise<PropertyImportItem | undefined>;
  /** Por número de fila. */
  problems(query: {
    readonly importId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<PropertyImportRowProblem>>;
}
