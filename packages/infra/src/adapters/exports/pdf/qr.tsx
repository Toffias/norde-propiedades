import { Path, Rect, Svg } from '@react-pdf/renderer';
import { create } from 'qrcode';
import type { ReactElement } from 'react';

import { PDF_COLORS } from './theme';

// El QR como vector del PDF (no como imagen): se imprime nítido a cualquier tamaño. Corrección "M"
// (15 %), suficiente para una hoja pegada en una vidriera, con el margen de 4 módulos que pide la
// norma para que los celulares lo lean.

const QUIET_ZONE = 4;

/** Los módulos oscuros del QR como un único trazo SVG, en unidades de módulo. */
export function qrPath(text: string): { readonly size: number; readonly d: string } {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const squares: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col) === 1) {
        squares.push(`M${(col + QUIET_ZONE).toString()} ${(row + QUIET_ZONE).toString()}h1v1h-1z`);
      }
    }
  }
  return { size: modules.size + QUIET_ZONE * 2, d: squares.join('') };
}

/** Un QR de `size` puntos, con fondo blanco aunque la hoja tenga color. */
export function PdfQr({
  url,
  size,
  color = PDF_COLORS.ink,
}: {
  readonly url: string;
  readonly size: number;
  readonly color?: string;
}): ReactElement {
  const { size: modules, d } = qrPath(url);
  const box = modules.toString();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
      <Rect x="0" y="0" width={box} height={box} fill={PDF_COLORS.paper} />
      <Path d={d} fill={color} />
    </Svg>
  );
}
