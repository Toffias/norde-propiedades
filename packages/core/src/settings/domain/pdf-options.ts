import { err, ok, type Result } from '../../shared/domain/result';

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
  /**
   * Contacto en texto libre: reemplaza a los datos de la sucursal (dirección, teléfonos, email) en
   * los PDF. Si la sucursal tiene el suyo, va el de la sucursal.
   */
  readonly contactText: string | undefined;
  /** El color de los títulos, badges e íconos de todos los PDF (`#rrggbb`, en minúsculas). */
  readonly brandColor: string;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  showCompanyContact: true,
  agentInfo: 'show',
  showPrice: true,
  addressOnSend: 'approximate',
  addressOnDownload: 'full',
  developmentPhotosInUnits: true,
  contactText: undefined,
  brandColor: '#c9302b',
};

/**
 * El contacto de la empresa en los PDF: el texto libre de la sucursal; si no tiene, el de Mi empresa;
 * si tampoco, ninguno (y van la dirección, los teléfonos y el email).
 */
export function withPdfContactText<T extends { readonly text: string | undefined }>(
  contact: T,
  options: Pick<PdfOptions, 'contactText'>,
): T {
  if (contact.text !== undefined) return contact;
  return { ...contact, text: options.contactText };
}

/** Contraste mínimo con el blanco (WCAG, texto grande y gráficos): títulos sobre la hoja y texto blanco sobre el badge. */
export const MIN_BRAND_COLOR_CONTRAST = 3;

export interface BrandColorTooLightError {
  readonly type: 'BrandColorTooLight';
  readonly contrast: number;
}

/** Luminancia relativa de un canal sRGB (0 a 255), según WCAG 2. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Contraste de un color `#rrggbb` con el blanco: de 1 (blanco) a 21 (negro). */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const luminance = 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
  return 1.05 / (luminance + 0.05);
}

/**
 * El color de marca de los PDF. Tiene que leerse sobre el blanco de la hoja (títulos, íconos) y con
 * texto blanco encima (el badge de la operación): con menos de 3:1, no se acepta.
 */
export function brandColor(hex: string): Result<string, BrandColorTooLightError> {
  const contrast = contrastWithWhite(hex);
  if (contrast < MIN_BRAND_COLOR_CONTRAST) {
    return err({ type: 'BrandColorTooLight', contrast: Math.round(contrast * 100) / 100 });
  }
  return ok(hex.toLowerCase());
}
