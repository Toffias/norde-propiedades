import type { PropertyImportProblemRow, PropertyImportRow } from '@norde/core/properties/contracts';

import type { PanelData } from '../../lib/panel-params';

// El panel de una importación de Tokko. Fuera de los componentes cliente: lo usa también la página
// (Server Component) para saber qué cargar.

/** Filas con problemas por página dentro del panel: una página corta y fija. */
export const PROPERTY_IMPORT_PROBLEMS_PAGE_SIZE = 10;

export interface PropertyImportProblemsPage {
  readonly rows: readonly PropertyImportProblemRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PropertyImportSheetData {
  readonly job: PropertyImportRow;
  readonly problems: PanelData<PropertyImportProblemsPage>;
}
