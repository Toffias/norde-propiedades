import type {
  DevelopmentUnitImportProblemRow,
  DevelopmentUnitImportRow,
} from '@norde/core/properties/contracts';

import type { PanelData } from '../../lib/panel-params';

// El panel de una importación de unidades. Fuera de los componentes cliente: lo usa también la
// página (Server Component) para saber qué cargar.

/** Filas con problemas por página dentro del panel: una página corta y fija. */
export const UNIT_IMPORT_PROBLEMS_PAGE_SIZE = 10;

export interface UnitImportProblemsPage {
  readonly rows: readonly DevelopmentUnitImportProblemRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface UnitImportSheetData {
  readonly job: DevelopmentUnitImportRow;
  readonly problems: PanelData<UnitImportProblemsPage>;
}
