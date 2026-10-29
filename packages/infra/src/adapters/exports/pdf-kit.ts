import {
  rgb,
  StandardFonts,
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import sharp from 'sharp';

// Piezas comunes de los PDF armados con pdf-lib (A4, Helvetica), en español: la paleta de Norde,
// la cabecera y el pie de cada hoja, el cursor que escribe de arriba hacia abajo y los bloques
// (títulos de sección, grilla de datos, etiquetas, tablas, tarjetas y fotos recortadas).

export const PAGE = { width: 595.28, height: 841.89, margin: 40 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
/** Alto de la franja oscura de la cabecera (más la línea de acento). */
export const HEADER_HEIGHT = 64;
const ACCENT_LINE = 3;
/** Alto reservado para el pie. */
export const FOOTER_HEIGHT = 50;
/** Dónde empieza y dónde termina el contenido de cada hoja. */
export const CONTENT_TOP = PAGE.height - HEADER_HEIGHT - ACCENT_LINE - 24;
export const CONTENT_BOTTOM = FOOTER_HEIGHT + 16;
export const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function hex(value: string): Color {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/** La paleta del panel (`packages/ui/src/themes/gestion.css`). */
export const BRAND = {
  dark: hex('#241c00'),
  dark2: hex('#3a2e05'),
  cream: hex('#e7dfc4'),
  accent: hex('#e5383b'),
  accentDark: hex('#a6231f'),
  sand: hex('#f2efe5'),
  sandDark: hex('#d9cfae'),
  white: rgb(1, 1, 1),
} as const;
export const INK = hex('#1f1b12');
export const MUTED = hex('#6b6455');
export const RULE = hex('#e3dccb');

export const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
export const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export const CONDITION_LABELS: Readonly<Record<string, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};

/**
 * Las fuentes estándar del PDF codifican WinAnsi: Latin-1 más comillas tipográficas, guiones,
 * viñeta y puntos suspensivos. Lo demás se quita.
 */
export function printable(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(
      /[^\u0020-\u007E\u00A0-\u00FF\n\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g,
      '',
    );
}

/** Centavos → "USD 120.000" (exacto: sin pasar los centavos por `number` hasta el final). */
export function money(currency: string, cents: bigint): string {
  const units = Number(cents / 100n) + Number(cents % 100n) / 100;
  return `${currency} ${numberFormat.format(units)}`;
}

/** Centavos → "USD 1.375": para montos grandes, sin decimales. */
export function roundMoney(currency: string, cents: bigint): string {
  return `${currency} ${integerFormat.format(Number((cents + 50n) / 100n))}`;
}

/** Rango en centavos → "USD 135.000 – 148.000" (la moneda una sola vez), o un monto si coinciden. */
export function moneyRange(currency: string, minCents: bigint, maxCents: bigint): string {
  const min = roundMoney(currency, minCents);
  if (minCents === maxCents) return min;
  return `${min} – ${integerFormat.format(Number((maxCents + 50n) / 100n))}`;
}

/** El cuerpo más grande (hasta `max`) con el que el texto entra en una línea de `width`. */
export function fitSize(font: PDFFont, text: string, max: number, width: number, min = 8): number {
  let size = max;
  while (size > min && font.widthOfTextAtSize(printable(text), size) > width) size -= 0.5;
  return size;
}

/** "1.234,5 m²". */
export function squareMeters(value: number): string {
  return `${numberFormat.format(value)} m²`;
}

/** E.164 → algo legible: "+54 9 11 6689-9124" en el AMBA; si no, tal cual. */
export function displayPhone(e164: string): string {
  const amba = /^\+5491(1)(\d{4})(\d{4})$/.exec(e164);
  if (amba) return `+54 9 11 ${amba[2] ?? ''}-${amba[3] ?? ''}`;
  const landline = /^\+5411(\d{4})(\d{4})$/.exec(e164);
  if (landline) return `+54 11 ${landline[1] ?? ''}-${landline[2] ?? ''}`;
  const argentina = /^\+54(9?)(\d+)$/.exec(e164);
  if (argentina) return `+54 ${argentina[1] === '9' ? '9 ' : ''}${argentina[2] ?? ''}`;
  return e164;
}

/** Un contacto para imprimir: el de la sucursal o el del agente. */
export interface PrintableContact {
  readonly name: string;
  readonly address: string | undefined;
  readonly phone: string | undefined;
  readonly whatsapp: string | undefined;
  readonly email: string | undefined;
}

/** "Tel. ... · WhatsApp ... · email": los medios de contacto que tiene. */
export function contactParts(contact: PrintableContact): string[] {
  return [
    contact.phone === undefined ? undefined : `Tel. ${displayPhone(contact.phone)}`,
    contact.whatsapp === undefined ? undefined : `WhatsApp ${displayPhone(contact.whatsapp)}`,
    contact.email,
  ].filter((part): part is string => part !== undefined);
}

/** Fecha `AAAA-MM-DD` → "01/09/2026". */
export function isoDay(value: string): string {
  return value.split('-').reverse().join('/');
}

export interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly italic: PDFFont;
}

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

// ---------- Imágenes ----------

/** Resolución de las fotos: ~2,4 px por punto alcanza para imprimir sin que el archivo pese. */
const PX_PER_POINT = 2.4;
const MAX_SIDE = 1600;

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * La foto enderezada según el EXIF, en JPEG. Con `cover`, recortada al centro de interés para
 * llenar ese recuadro (en puntos); si no, achicada entera. `undefined` si sharp no puede leerla
 * (WebP, HEIC y PNG se convierten; un archivo que no es una imagen se omite).
 */
export async function photoJpeg(
  bytes: Uint8Array,
  cover?: { readonly width: number; readonly height: number },
): Promise<Uint8Array | undefined> {
  try {
    const image = sharp(toBuffer(bytes)).rotate();
    const resized = cover
      ? image.resize({
          width: Math.min(MAX_SIDE, Math.round(cover.width * PX_PER_POINT)),
          height: Math.min(MAX_SIDE, Math.round(cover.height * PX_PER_POINT)),
          fit: 'cover',
          position: sharp.strategy.attention,
        })
      : image.resize({
          width: MAX_SIDE,
          height: MAX_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        });
    const jpeg = await resized
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(jpeg);
  } catch {
    // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
    return undefined;
  }
}

/** La foto recortada al recuadro y embebida en el PDF. */
export async function embedPhoto(
  doc: PDFDocument,
  bytes: Uint8Array,
  box: { readonly width: number; readonly height: number },
): Promise<PDFImage | undefined> {
  const jpeg = await photoJpeg(bytes, box);
  return jpeg === undefined ? undefined : doc.embedJpg(jpeg);
}

/** El logo en PNG (conserva la transparencia), de hasta 600 px. */
export async function embedLogo(
  doc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage | undefined> {
  try {
    const png = await sharp(toBuffer(bytes))
      .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return await doc.embedPng(new Uint8Array(png));
  } catch {
    // Un logo que no es una imagen: la cabecera lleva el nombre de la empresa.
    return undefined;
  }
}

// ---------- Dibujo ----------

/** Rectángulo con esquinas redondeadas; `y` es el borde inferior. */
export function roundedRect(
  page: PDFPage,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  options: { readonly color?: Color; readonly border?: Color; readonly radius?: number },
): void {
  const { width: w, height: h } = box;
  const r = Math.min(options.radius ?? 6, w / 2, h / 2);
  const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, {
    x: box.x,
    y: box.y + h,
    ...(options.color ? { color: options.color } : {}),
    ...(options.border ? { borderColor: options.border, borderWidth: 0.75 } : {}),
  });
}

/** Corta un texto en líneas que entran en `width`, por palabra (una palabra larga se corta). */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current !== '') lines.push(current);
      current = word;
      // Una palabra que sola no entra (un link largo) se corta por letra.
      while (font.widthOfTextAtSize(current, size) > width && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > width) cut -= 1;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    lines.push(current);
  }
  return lines;
}

/** Recorta a `maxLines` líneas, con puntos suspensivos si sobra texto. */
export function clampLines(
  lines: readonly string[],
  maxLines: number,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  if (lines.length <= maxLines) return [...lines];
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last !== '' && font.widthOfTextAtSize(`${last}…`, size) > width) {
    last = last.slice(0, -1).trimEnd();
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export interface TextOptions {
  readonly size: number;
  readonly font?: PDFFont;
  readonly color?: Color;
  readonly x?: number;
  readonly width?: number;
  /** Interlineado, en múltiplos del cuerpo. */
  readonly leading?: number;
  readonly align?: 'left' | 'right' | 'center';
  readonly maxLines?: number;
}

/**
 * Escribe un párrafo con su borde superior en `top` y devuelve el alto que ocupó. No salta de
 * hoja: para eso está `Cursor.text`.
 */
export function drawText(
  page: PDFPage,
  fonts: Fonts,
  value: string,
  top: number,
  options: TextOptions,
): number {
  const font = options.font ?? fonts.regular;
  const width = options.width ?? CONTENT_WIDTH;
  const x = options.x ?? PAGE.margin;
  const lineHeight = options.size * (options.leading ?? 1.3);
  let lines = wrap(value, font, options.size, width);
  if (options.maxLines !== undefined) {
    lines = clampLines(lines, options.maxLines, font, options.size, width);
  }
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, options.size);
    const offset =
      options.align === 'right'
        ? width - lineWidth
        : options.align === 'center'
          ? (width - lineWidth) / 2
          : 0;
    page.drawText(line, {
      x: x + offset,
      // La línea base, debajo del borde superior de la línea.
      y: top - index * lineHeight - options.size * 0.92,
      size: options.size,
      font,
      color: options.color ?? INK,
    });
  });
  return lines.length * lineHeight;
}

/** El alto que ocuparía un párrafo. */
export function textHeight(fonts: Fonts, value: string, options: TextOptions): number {
  const font = options.font ?? fonts.regular;
  const lines = wrap(value, font, options.size, options.width ?? CONTENT_WIDTH).length;
  const count = options.maxLines === undefined ? lines : Math.min(lines, options.maxLines);
  return count * options.size * (options.leading ?? 1.3);
}

/** Escribe de arriba hacia abajo entre la cabecera y el pie, y agrega hojas cuando hace falta. */
export class Cursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = CONTENT_TOP;
  }

  /** ¿Entra un bloque de este alto en lo que queda de la hoja? */
  fits(height: number): boolean {
    return this.y - height >= CONTENT_BOTTOM;
  }

  ensure(height: number): void {
    if (this.fits(height)) return;
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = CONTENT_TOP;
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** Un párrafo; las líneas que no entran pasan a la hoja siguiente. */
  text(value: string, options: TextOptions): void {
    const font = options.font ?? this.fonts.regular;
    const width = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.size * (options.leading ?? 1.3);
    let lines = wrap(value, font, options.size, width);
    if (options.maxLines !== undefined) {
      lines = clampLines(lines, options.maxLines, font, options.size, width);
    }
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= drawText(this.page, this.fonts, line, this.y, {
        ...options,
        maxLines: 1,
        leading: options.leading ?? 1.3,
      });
    }
  }

  /** Título de sección: una barrita de acento, el título y una línea fina. */
  section(title: string, keepWith = 60): void {
    this.ensure(28 + keepWith);
    this.gap(6);
    const top = this.y;
    this.page.drawRectangle({
      x: PAGE.margin,
      y: top - 13,
      width: 3,
      height: 13,
      color: BRAND.accent,
    });
    drawText(this.page, this.fonts, title.toUpperCase(), top - 1, {
      size: 10.5,
      font: this.fonts.bold,
      color: BRAND.dark,
      x: PAGE.margin + 10,
    });
    this.page.drawLine({
      start: { x: PAGE.margin, y: top - 20 },
      end: { x: PAGE.width - PAGE.margin, y: top - 20 },
      thickness: 0.5,
      color: RULE,
    });
    this.y = top - 30;
  }
}

/** Un dato con su rótulo: "Ambientes" / "3". */
export interface Fact {
  readonly label: string;
  readonly value: string;
}

/** Grilla de datos en recuadros, de a `columns` por fila. */
export function factsGrid(cursor: Cursor, facts: readonly Fact[], columns = 4): void {
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 46;
  for (let start = 0; start < facts.length; start += columns) {
    cursor.ensure(height);
    const top = cursor.y;
    facts.slice(start, start + columns).forEach((fact, column) => {
      const x = PAGE.margin + column * (width + gap);
      roundedRect(cursor.page, { x, y: top - height, width, height }, { color: BRAND.sand });
      drawText(cursor.page, cursor.fonts, fact.label.toUpperCase(), top - 9, {
        size: 7,
        font: cursor.fonts.bold,
        color: MUTED,
        x: x + 10,
        width: width - 20,
        maxLines: 1,
      });
      drawText(cursor.page, cursor.fonts, fact.value, top - 22, {
        size: 12.5,
        font: cursor.fonts.bold,
        color: INK,
        x: x + 10,
        width: width - 20,
        maxLines: 1,
      });
    });
    cursor.y = top - height - gap;
  }
}

/** Etiquetas redondeadas una al lado de la otra ("Apto crédito", "Acepta permuta"). */
export function chips(
  cursor: Cursor,
  labels: readonly string[],
  options: { readonly size?: number; readonly fill?: Color; readonly color?: Color } = {},
): void {
  if (labels.length === 0) return;
  const size = options.size ?? 9;
  const height = size + 10;
  const gap = 6;
  let x = PAGE.margin;
  cursor.ensure(height);
  let top = cursor.y;
  for (const raw of labels) {
    const label = printable(raw);
    const width = cursor.fonts.bold.widthOfTextAtSize(label, size) + 20;
    if (x + width > PAGE.width - PAGE.margin) {
      x = PAGE.margin;
      cursor.y = top - height - gap;
      cursor.ensure(height);
      top = cursor.y;
    }
    roundedRect(
      cursor.page,
      { x, y: top - height, width, height },
      { color: options.fill ?? BRAND.sand, radius: height / 2 },
    );
    cursor.page.drawText(label, {
      x: x + 10,
      y: top - height / 2 - size * 0.35,
      size,
      font: cursor.fonts.bold,
      color: options.color ?? BRAND.dark2,
    });
    x += width + gap;
  }
  cursor.y = top - height - gap;
}

/** Lista con viñetas en columnas, de arriba hacia abajo. */
export function bulletColumns(cursor: Cursor, items: readonly string[], columns = 3): void {
  const gap = 12;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const rows = Math.ceil(items.length / columns);
  const size = 9.5;
  for (let row = 0; row < rows; row += 1) {
    const cells = Array.from({ length: columns }, (_, column) => items[column * rows + row]);
    const height = Math.max(
      ...cells.map((cell) =>
        cell === undefined
          ? 0
          : textHeight(cursor.fonts, cell, { size, width: width - 10, leading: 1.35 }),
      ),
    );
    cursor.ensure(height + 2);
    const top = cursor.y;
    cells.forEach((cell, column) => {
      if (cell === undefined) return;
      const x = PAGE.margin + column * (width + gap);
      cursor.page.drawCircle({ x: x + 2, y: top - size * 0.6, size: 1.6, color: BRAND.accent });
      drawText(cursor.page, cursor.fonts, cell, top, {
        size,
        x: x + 9,
        width: width - 10,
        leading: 1.35,
      });
    });
    cursor.y = top - height - 2;
  }
}

/** Una columna de tabla: título, ancho y alineación. */
export interface Column {
  readonly title: string;
  readonly width: number;
  readonly align?: 'left' | 'right';
}

/** Una fila: sus celdas y, opcional, una nota debajo de la primera. */
export interface TableRow {
  readonly cells: readonly string[];
  readonly note?: string | undefined;
}

/** Tabla con cabecera en arena y filas alternadas; repite la cabecera en cada hoja. */
export function table(cursor: Cursor, columns: readonly Column[], rows: readonly TableRow[]): void {
  const size = 9;
  const pad = 8;
  const rowHeight = (row: TableRow) => {
    const first = columns[0]?.width ?? CONTENT_WIDTH;
    const cellHeights = columns.map((column, i) =>
      textHeight(cursor.fonts, row.cells[i] ?? '', { size, width: column.width - pad * 2 }),
    );
    const noteHeight =
      row.note === undefined
        ? 0
        : textHeight(cursor.fonts, row.note, { size: 7.5, width: first - pad * 2 }) + 2;
    return Math.max(...cellHeights, (cellHeights[0] ?? 0) + noteHeight) + pad * 2 - 2;
  };
  const header = (next: TableRow | undefined) => {
    // La cabecera nunca queda sola al pie de la hoja: va con la fila que sigue.
    cursor.ensure(20 + (next === undefined ? 0 : rowHeight(next)));
    const top = cursor.y;
    roundedRect(
      cursor.page,
      { x: PAGE.margin, y: top - 20, width: CONTENT_WIDTH, height: 20 },
      { color: BRAND.dark, radius: 4 },
    );
    let x = PAGE.margin;
    for (const column of columns) {
      drawText(cursor.page, cursor.fonts, column.title.toUpperCase(), top - 6.5, {
        size: 7,
        font: cursor.fonts.bold,
        color: BRAND.cream,
        x: x + pad,
        width: column.width - pad * 2,
        align: column.align ?? 'left',
        maxLines: 1,
      });
      x += column.width;
    }
    cursor.y = top - 20;
  };
  header(rows[0]);
  rows.forEach((row, index) => {
    const height = rowHeight(row);
    if (!cursor.fits(height)) {
      cursor.newPage();
      header(row);
    }
    const top = cursor.y;
    if (index % 2 === 1) {
      cursor.page.drawRectangle({
        x: PAGE.margin,
        y: top - height,
        width: CONTENT_WIDTH,
        height,
        color: BRAND.sand,
      });
    }
    let x = PAGE.margin;
    columns.forEach((column, i) => {
      const used = drawText(cursor.page, cursor.fonts, row.cells[i] ?? '', top - pad + 1, {
        size,
        font: i === 0 ? cursor.fonts.bold : cursor.fonts.regular,
        x: x + pad,
        width: column.width - pad * 2,
        align: column.align ?? 'left',
      });
      if (i === 0 && row.note !== undefined) {
        drawText(cursor.page, cursor.fonts, row.note, top - pad + 1 - used - 1, {
          size: 7.5,
          font: cursor.fonts.italic,
          color: MUTED,
          x: x + pad,
          width: column.width - pad * 2,
        });
      }
      x += column.width;
    });
    cursor.page.drawLine({
      start: { x: PAGE.margin, y: top - height },
      end: { x: PAGE.width - PAGE.margin, y: top - height },
      thickness: 0.5,
      color: RULE,
    });
    cursor.y = top - height;
  });
  cursor.gap(10);
}

/** Tarjeta oscura de contacto: el agente y la sucursal, con un título y, opcional, un link. */
export function contactCard(
  cursor: Cursor,
  card: {
    readonly title: string;
    readonly agent: PrintableContact | undefined;
    readonly branch: PrintableContact | undefined;
    readonly companyName: string;
    readonly link?: string | undefined;
    readonly agentLabel?: string;
  },
): void {
  const pad = 16;
  const columnWidth = (CONTENT_WIDTH - pad * 3) / 2;
  const blocks: { label: string; name: string; lines: string[] }[] = [];
  if (card.agent) {
    blocks.push({
      label: card.agentLabel ?? 'Te atiende',
      name: card.agent.name,
      lines: contactParts(card.agent),
    });
  }
  const branch = card.branch;
  blocks.push({
    label: branch ? 'Sucursal' : 'Inmobiliaria',
    // La marca ya está en el logo de la cabecera: la sucursal va con su nombre solo.
    name: branch ? branch.name : card.companyName,
    lines: branch
      ? [branch.address, ...contactParts(branch)].filter(
          (line): line is string => line !== undefined,
        )
      : [],
  });
  const blockHeight = (block: (typeof blocks)[number]) =>
    11 +
    textHeight(cursor.fonts, block.name, {
      size: 11,
      width: columnWidth,
      font: cursor.fonts.bold,
    }) +
    block.lines.reduce(
      (total, line) => total + textHeight(cursor.fonts, line, { size: 9, width: columnWidth }),
      0,
    );
  const titleHeight = 22;
  const linkHeight =
    card.link === undefined
      ? 0
      : 8 + textHeight(cursor.fonts, card.link, { size: 9, width: CONTENT_WIDTH - pad * 2 });
  const height = pad * 2 + titleHeight + Math.max(...blocks.map(blockHeight)) + linkHeight;
  cursor.ensure(height + 4);
  const top = cursor.y;
  roundedRect(
    cursor.page,
    { x: PAGE.margin, y: top - height, width: CONTENT_WIDTH, height },
    { color: BRAND.dark, radius: 8 },
  );
  cursor.page.drawRectangle({
    x: PAGE.margin + pad,
    y: top - pad - 14,
    width: 3,
    height: 14,
    color: BRAND.accent,
  });
  drawText(cursor.page, cursor.fonts, card.title, top - pad, {
    size: 13,
    font: cursor.fonts.bold,
    color: BRAND.white,
    x: PAGE.margin + pad + 10,
    width: CONTENT_WIDTH - pad * 2,
  });
  blocks.forEach((block, index) => {
    const x = PAGE.margin + pad + index * (columnWidth + pad);
    let y = top - pad - titleHeight;
    drawText(cursor.page, cursor.fonts, block.label.toUpperCase(), y, {
      size: 7,
      font: cursor.fonts.bold,
      color: BRAND.cream,
      x,
      width: columnWidth,
    });
    y -= 11;
    y -= drawText(cursor.page, cursor.fonts, block.name, y, {
      size: 11,
      font: cursor.fonts.bold,
      color: BRAND.white,
      x,
      width: columnWidth,
    });
    for (const line of block.lines) {
      y -= drawText(cursor.page, cursor.fonts, line, y, {
        size: 9,
        color: BRAND.cream,
        x,
        width: columnWidth,
      });
    }
  });
  if (card.link !== undefined) {
    drawText(cursor.page, cursor.fonts, card.link, top - height + pad + 11, {
      size: 9,
      font: cursor.fonts.bold,
      color: BRAND.cream,
      x: PAGE.margin + pad,
      width: CONTENT_WIDTH - pad * 2,
    });
  }
  cursor.y = top - height - 12;
}

/** Fotos recortadas en una grilla de `columns` por fila, con la proporción `ratio` (alto/ancho). */
export async function photoGrid(
  cursor: Cursor,
  doc: PDFDocument,
  photos: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  options: { readonly columns: number; readonly ratio: number; readonly title?: string },
): Promise<void> {
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * (options.columns - 1)) / options.columns;
  const height = width * options.ratio;
  let row: PDFImage[] = [];
  let titled = options.title === undefined;
  const flush = () => {
    if (row.length === 0) return;
    if (!titled && options.title !== undefined) {
      cursor.section(options.title, height);
      titled = true;
    }
    cursor.ensure(height);
    const top = cursor.y;
    row.forEach((image, column) => {
      cursor.page.drawImage(image, {
        x: PAGE.margin + column * (width + gap),
        y: top - height,
        width,
        height,
      });
    });
    cursor.y = top - height - gap;
    row = [];
  };
  for await (const bytes of photos) {
    const image = await embedPhoto(doc, bytes, { width, height });
    if (image === undefined) continue;
    row.push(image);
    if (row.length === options.columns) flush();
  }
  flush();
}

// ---------- Cabecera y pie ----------

export interface Chrome {
  readonly companyName: string;
  readonly logo: Uint8Array | undefined;
  /** "Ficha de la propiedad". */
  readonly title: string;
  /** "DEP0001". */
  readonly code: string | undefined;
  /** El contacto del pie: la sucursal, si hay. */
  readonly contact: PrintableContact | undefined;
  readonly generatedAt: Date;
  readonly pageNumbers?: boolean;
}

/** Dibuja la cabecera (franja oscura con la marca) y el pie (contacto y página) en cada hoja. */
export async function drawChrome(doc: PDFDocument, fonts: Fonts, chrome: Chrome): Promise<void> {
  const logo = chrome.logo === undefined ? undefined : await embedLogo(doc, chrome.logo);
  const pages = doc.getPages();
  const top = PAGE.height;
  pages.forEach((page, index) => {
    page.drawRectangle({
      x: 0,
      y: top - HEADER_HEIGHT,
      width: PAGE.width,
      height: HEADER_HEIGHT,
      color: BRAND.dark,
    });
    page.drawRectangle({
      x: 0,
      y: top - HEADER_HEIGHT - ACCENT_LINE,
      width: PAGE.width,
      height: ACCENT_LINE,
      color: BRAND.accent,
    });
    if (logo) {
      const boxHeight = 40;
      const scale = Math.min(150 / logo.width, (boxHeight - 12) / logo.height);
      const width = logo.width * scale;
      const height = logo.height * scale;
      const boxWidth = width + 16;
      const boxY = top - HEADER_HEIGHT / 2 - boxHeight / 2;
      roundedRect(
        page,
        { x: PAGE.margin, y: boxY, width: boxWidth, height: boxHeight },
        { color: BRAND.cream, radius: 6 },
      );
      page.drawImage(logo, {
        x: PAGE.margin + 8,
        y: boxY + (boxHeight - height) / 2,
        width,
        height,
      });
    } else {
      drawText(page, fonts, chrome.companyName, top - HEADER_HEIGHT / 2 + 9, {
        size: 17,
        font: fonts.bold,
        color: BRAND.white,
        width: 300,
        maxLines: 1,
      });
    }
    drawText(page, fonts, chrome.title.toUpperCase(), top - 19, {
      size: 7.5,
      font: fonts.bold,
      color: BRAND.cream,
      x: PAGE.width / 2,
      width: PAGE.width / 2 - PAGE.margin,
      align: 'right',
      maxLines: 1,
    });
    if (chrome.code !== undefined) {
      drawText(page, fonts, chrome.code, top - 31, {
        size: 14,
        font: fonts.bold,
        color: BRAND.white,
        x: PAGE.width / 2,
        width: PAGE.width / 2 - PAGE.margin,
        align: 'right',
        maxLines: 1,
      });
    }

    // Pie.
    page.drawLine({
      start: { x: PAGE.margin, y: FOOTER_HEIGHT },
      end: { x: PAGE.width - PAGE.margin, y: FOOTER_HEIGHT },
      thickness: 0.5,
      color: RULE,
    });
    const contact = chrome.contact;
    // Con logo, la marca ya está arriba: el pie lleva solo la sucursal.
    const name = logo
      ? (contact?.name ?? '')
      : contact
        ? `${chrome.companyName} · ${contact.name}`
        : chrome.companyName;
    const lineWidth = CONTENT_WIDTH - 90;
    drawText(page, fonts, name, FOOTER_HEIGHT - 8, {
      size: 8,
      font: fonts.bold,
      color: BRAND.dark,
      width: lineWidth,
      maxLines: 1,
    });
    const details = contact
      ? [contact.address, ...contactParts(contact)].filter((part) => part !== undefined)
      : [];
    if (details.length > 0) {
      drawText(page, fonts, details.join('  ·  '), FOOTER_HEIGHT - 19, {
        size: 7.5,
        color: MUTED,
        width: lineWidth,
        maxLines: 1,
      });
    }
    drawText(
      page,
      fonts,
      `Generado el ${dateFormat.format(chrome.generatedAt)}`,
      FOOTER_HEIGHT - 30,
      {
        size: 7,
        color: MUTED,
        width: lineWidth,
        maxLines: 1,
      },
    );
    if (chrome.pageNumbers ?? true) {
      drawText(
        page,
        fonts,
        `Página ${(index + 1).toString()} de ${pages.length.toString()}`,
        FOOTER_HEIGHT - 8,
        {
          size: 8,
          color: MUTED,
          x: PAGE.width - PAGE.margin - 90,
          width: 90,
          align: 'right',
        },
      );
    }
  });
}
