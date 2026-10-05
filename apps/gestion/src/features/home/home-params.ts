// Params de la URL de Inicio: la vista, los filtros y la página de cada listado.

export const HOME_VIEW_VALUES = ['pendientes', 'estado'] as const;
export type HomeView = (typeof HOME_VIEW_VALUES)[number];

/** Página de cada listado en la URL: dos grillas en la misma pantalla, cada una con su param. */
export const PROPERTIES_PAGE_PARAM = 'propiedades';
export const DEVELOPMENTS_PAGE_PARAM = 'emprendimientos';

/** Los filtros de Inicio tal como están en la URL, para abrir cada módulo con los mismos. */
export interface HomeFilterValues {
  readonly agentId: string;
  readonly branchId: string;
}
