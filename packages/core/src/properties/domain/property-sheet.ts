// La ficha en PDF en los formatos de Tokko (#175): una hoja horizontal por propiedad (con o sin
// mapa), varias hojas verticales por propiedad (con o sin mapa) y la grilla, una tabla para
// comparar varias propiedades lado a lado.

export const PROPERTY_SHEET_LAYOUTS = [
  'landscape',
  'landscape_map',
  'portrait',
  'portrait_map',
  'grid',
] as const;
export type PropertySheetLayout = (typeof PROPERTY_SHEET_LAYOUTS)[number];

/** El formato de una ficha sola: la grilla compara varias, con una no tiene sentido. */
export const SINGLE_PROPERTY_SHEET_LAYOUTS = [
  'landscape',
  'landscape_map',
  'portrait',
  'portrait_map',
] as const satisfies readonly PropertySheetLayout[];

/** Si el formato lleva el mapa de la ubicación. */
export function sheetHasMap(layout: PropertySheetLayout): boolean {
  return layout === 'landscape_map' || layout === 'portrait_map';
}

/** Cómo decide Mi empresa los datos del agente en el PDF ("Ficha y PDF"). */
export type AgentInfoRule = 'show' | 'hide' | 'ask';

/**
 * Si el PDF lleva los datos del agente: lo decide la configuración, salvo que pida preguntar; ahí
 * vale lo que eligió quien lo arma (sin elegir, no van).
 */
export function includesAgent(rule: AgentInfoRule, requested: boolean | undefined): boolean {
  switch (rule) {
    case 'show':
      return true;
    case 'hide':
      return false;
    case 'ask':
      return requested ?? false;
  }
}

/** La ficha de varias propiedades en un PDF: lo que entra en un pedido. */
export const MAX_LIST_DOCUMENT_PROPERTIES = 100;
