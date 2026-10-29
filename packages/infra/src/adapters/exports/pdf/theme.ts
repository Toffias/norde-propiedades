import { Font } from '@react-pdf/renderer';

import { PLUS_JAKARTA_SANS } from './fonts.generated';

// La identidad de los PDF: la misma del sitio público ("Barrio claro", `packages/ui/src/themes/
// web.css`), porque los PDF los lee el cliente. Tipografía Plus Jakarta Sans y un único rojo de
// marca (ADR 0051).

export const PDF_FONT = 'PlusJakartaSans';

export const PDF_COLORS = {
  /** Rojo de marca: títulos de sección, badge de operación, íconos. */
  brand: '#c9302b',
  ink: '#2a2522',
  muted: '#6b615a',
  rule: '#e9e0d5',
  /** Fondo de tarjetas y franjas suaves. */
  sand: '#f3ede5',
  paper: '#ffffff',
} as const;

export type PdfColors = { readonly [K in keyof typeof PDF_COLORS]: string };

/** Cuerpos en puntos. */
export const PDF_TYPE = {
  caption: 6.5,
  small: 7.5,
  body: 8.5,
  lead: 10,
  title: 20,
} as const;

let registered = false;

/** Registra la tipografía una sola vez por proceso (la usa `renderPdf`). */
export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: PLUS_JAKARTA_SANS[400], fontWeight: 400 },
      { src: PLUS_JAKARTA_SANS[600], fontWeight: 600 },
      { src: PLUS_JAKARTA_SANS[800], fontWeight: 800 },
    ],
  });
  // Sin guiones de corte: en español los cortes automáticos de react-pdf quedan mal.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
