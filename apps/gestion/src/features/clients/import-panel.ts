import type { ClientImportProblemRow, ClientImportRow } from '@norde/core/clients/contracts';

import type { PanelData } from '../../lib/panel-params';

// El panel de una importación. Fuera de los componentes cliente: lo usa también la página
// (Server Component) para saber qué cargar.

/** Filas con problemas por página dentro del panel: una página corta y fija. */
export const IMPORT_PROBLEMS_PAGE_SIZE = 10;

export interface ClientImportProblemsPage {
  readonly rows: readonly ClientImportProblemRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ClientImportSheetData {
  readonly job: ClientImportRow;
  readonly problems: PanelData<ClientImportProblemsPage>;
}
