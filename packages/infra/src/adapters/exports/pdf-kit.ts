import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

// Piezas comunes de los PDF armados con pdf-lib (A4, Helvetica), en español.

export const PAGE = { width: 595.28, height: 841.89, margin: 40 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
export const TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const INK = rgb(0.1, 0.1, 0.1);
export const MUTED = rgb(0.4, 0.4, 0.4);
export const RULE = rgb(0.85, 0.85, 0.85);

export const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
export const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const CONDITION_LABELS: Readonly<Record<string, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};

/** Las fuentes estándar del PDF solo tienen Latin-1: lo demás se reemplaza. */
export function printable(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00B2/g, '2')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\n]/g, '');
}

/** Centavos → "USD 120.000" (exacto: sin pasar los centavos por `number` hasta el final). */
export function money(currency: string, cents: bigint): string {
  const units = Number(cents / 100n) + Number(cents % 100n) / 100;
  return `${currency} ${numberFormat.format(units)}`;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

export async function embed(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | undefined> {
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  if (isPng(bytes)) return doc.embedPng(bytes);
  // WebP y otros formatos no los soporta pdf-lib: la foto se omite.
  return undefined;
}

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

/** Escribe de arriba hacia abajo, con salto de página y párrafos que se cortan por palabra. */
export class Cursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  ensure(height: number): void {
    if (this.y - height >= PAGE.margin) return;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  text(
    value: string,
    options: {
      readonly size: number;
      readonly bold?: boolean;
      readonly muted?: boolean;
      readonly x?: number;
      readonly width?: number;
    },
  ): void {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = options.width ?? CONTENT_WIDTH;
    for (const line of this.wrap(printable(value), font, options.size, width)) {
      this.ensure(options.size + 4);
      this.y -= options.size + 4;
      this.page.drawText(line, {
        x: options.x ?? PAGE.margin,
        y: this.y,
        size: options.size,
        font,
        color: options.muted ? MUTED : INK,
      });
    }
  }

  rule(): void {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 6;
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** Dibuja la imagen escalada para entrar en el recuadro, sin deformarla. */
  image(
    image: PDFImage,
    box: { readonly x: number; readonly width: number; readonly height: number },
  ) {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    this.ensure(height);
    this.page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: this.y - height,
      width,
      height,
    });
    return height;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (font.widthOfTextAtSize(candidate, size) <= width || current === '') {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  }
}

/** Lista en dos columnas. */
export function twoColumns(cursor: Cursor, items: readonly string[]) {
  const half = Math.ceil(items.length / 2);
  const column = CONTENT_WIDTH / 2;
  for (let index = 0; index < half; index += 1) {
    const left = items[index];
    const right = items[index + half];
    const y = cursor.y;
    if (left !== undefined) cursor.text(`• ${left}`, { size: 10, width: column - 8 });
    const afterLeft = cursor.y;
    if (right !== undefined) {
      cursor.y = y;
      cursor.text(`• ${right}`, { size: 10, x: PAGE.margin + column, width: column - 8 });
    }
    cursor.y = Math.min(afterLeft, cursor.y);
  }
}
