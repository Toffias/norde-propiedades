import type { PageSlice } from '../../../shared';
import type {
  DevelopmentUnitImportSnapshot,
  UnitImportRowProblem,
} from '../../domain/development-unit-import';

export type DevelopmentUnitImportItem = Omit<
  DevelopmentUnitImportSnapshot,
  'storageKey' | 'mapping' | 'canMarkAvailable' | 'updatedAt'
>;

/** El historial de importaciones de unidades de un emprendimiento y las filas que no se importaron. */
export interface DevelopmentUnitImportQuery {
  /** Las de un emprendimiento, las más recientes primero (o al revés). */
  list(query: {
    readonly developmentId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<DevelopmentUnitImportItem>>;
  find(importId: string): Promise<DevelopmentUnitImportItem | undefined>;
  /** Por número de fila. */
  problems(query: {
    readonly importId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<UnitImportRowProblem>>;
}
