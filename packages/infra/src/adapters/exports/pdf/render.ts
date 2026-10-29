import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { withBrandColor } from './brand';
import { registerPdfFonts } from './theme';

/** Arma el PDF de un `PdfDocument` (ADR 0051), con el color de marca de Mi empresa. */
export async function renderPdf(
  document: ReactElement<DocumentProps>,
  options: { readonly brandColor: string },
): Promise<Uint8Array> {
  registerPdfFonts();
  const buffer = await withBrandColor(options.brandColor, () => renderToBuffer(document));
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
