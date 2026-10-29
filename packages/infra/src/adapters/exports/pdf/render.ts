import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { registerPdfFonts } from './theme';

/** Arma el PDF de un `PdfDocument` (ADR 0051). */
export async function renderPdf(document: ReactElement<DocumentProps>): Promise<Uint8Array> {
  registerPdfFonts();
  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
