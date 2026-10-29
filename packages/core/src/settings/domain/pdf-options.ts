/** Qué dirección de la propiedad muestra la ficha. */
export const ADDRESS_DISPLAYS = ['full', 'approximate', 'hidden'] as const;
export type AddressDisplay = (typeof ADDRESS_DISPLAYS)[number];

/**
 * Los datos del agente en el PDF: siempre, nunca, o que elija quien lo arma (Tokko: "preguntar
 * siempre al exportar").
 */
export const AGENT_INFO_MODES = ['show', 'hide', 'ask'] as const;
export type AgentInfoMode = (typeof AGENT_INFO_MODES)[number];

/** Opciones de la ficha y el PDF de una propiedad. */
export interface PdfOptions {
  /** Datos de contacto de la empresa (sucursal) en el pie del PDF. */
  readonly showCompanyContact: boolean;
  /** Datos del agente que envía o descarga la ficha. */
  readonly agentInfo: AgentInfoMode;
  readonly showPrice: boolean;
  /** Dirección al enviar la ficha a un cliente. */
  readonly addressOnSend: AddressDisplay;
  /** Dirección al descargarla desde el panel. */
  readonly addressOnDownload: AddressDisplay;
  /** Las unidades de un emprendimiento muestran también las fotos del emprendimiento. */
  readonly developmentPhotosInUnits: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  showCompanyContact: true,
  agentInfo: 'show',
  showPrice: true,
  addressOnSend: 'approximate',
  addressOnDownload: 'full',
  developmentPhotosInUnits: true,
};
