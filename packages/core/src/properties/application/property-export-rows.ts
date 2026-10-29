import type { PropertyExportDetails, PropertyExportRow } from '../contracts';

import { toPanelRows } from './panel-filter';
import type { PanelPropertyListItem } from './ports/panel-property-list-query';
import type { PropertyExportDetailsQuery } from './ports/property-export-details-query';
import type { UserNames } from './ports/user-names';

/** Sin datos para una propiedad (no debería pasar: se leyó en el mismo lote), las celdas van vacías. */
const NO_DETAILS: PropertyExportDetails = {
  address: undefined,
  toilets: undefined,
  surfaceSemiCoveredM2: undefined,
  surfaceLandM2: undefined,
  frontM: undefined,
  depthM: undefined,
  expensesCents: undefined,
  maintenanceUser: undefined,
  branch: undefined,
  development: undefined,
  owner: undefined,
};

/** Las filas de un lote de la planilla: la del buscador más los detalles, en dos consultas. */
export async function toExportRows(
  items: readonly PanelPropertyListItem[],
  deps: { readonly users: UserNames; readonly details: PropertyExportDetailsQuery },
  options: { readonly includeOwners: boolean },
): Promise<PropertyExportRow[]> {
  const [rows, details] = await Promise.all([
    toPanelRows(items, deps.users),
    deps.details.details(
      items.map((item) => item.id),
      options,
    ),
  ]);
  return rows.map((row) => ({ ...row, details: details.get(row.id) ?? NO_DETAILS }));
}
