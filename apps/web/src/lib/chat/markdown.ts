/**
 * Markdown liviano de las respuestas del agente (negrita, listas y links), convertido a bloques
 * que el widget dibuja como elementos de React. Nunca se inyecta HTML: el texto viene del LLM.
 */

export type ChatInline =
  | { readonly kind: 'text'; readonly text: string; readonly bold: boolean }
  | { readonly kind: 'link'; readonly text: string; readonly href: string; readonly bold: boolean };

/** Una línea de texto: sus partes, en orden. */
export type ChatLine = readonly ChatInline[];

/** Un ítem de lista, con sus sub-ítems (un solo nivel: los datos de cada propiedad). */
export interface ChatListItem {
  readonly line: ChatLine;
  readonly children: readonly ChatLine[];
}

export type ChatBlock =
  | { readonly kind: 'paragraph'; readonly lines: readonly ChatLine[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      /** Número del primer ítem de una lista numerada (el agente puede seguir una anterior). */
      readonly start: number;
      readonly items: readonly ChatListItem[];
    };

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,2})[.)]\s+(.*)$/;
/** Sangría a partir de la cual una línea es parte del ítem anterior. */
const NESTED_INDENT = 2;
const HEADING = /^#{1,6}\s+/;
// Un link markdown con URL http(s), o una URL suelta.
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?¡¿"'])/g;

function parseLinks(text: string, bold: boolean): ChatInline[] {
  const parts: ChatInline[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, href, bare] = match;
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index), bold });
    const url = href ?? bare ?? whole;
    parts.push({ kind: 'link', text: label ?? url, href: url, bold });
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last), bold });
  return parts;
}

/** Las partes de una línea: los tramos entre `**` van en negrita. */
export function parseLine(line: string): ChatLine {
  const segments = line.replace(HEADING, '').split('**');
  // Con un `**` sin cerrar, el último tramo queda como texto normal.
  const closed = segments.length % 2 === 1 ? segments.length : segments.length - 1;
  return segments.flatMap((segment, index) => {
    if (segment === '') return [];
    const bold = index % 2 === 1 && index < closed;
    return parseLinks(index >= closed ? `**${segment}` : segment, bold);
  });
}

export function parseChatMarkdown(source: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let paragraph: ChatLine[] = [];
  let list:
    | { ordered: boolean; start: number; items: { line: ChatLine; children: ChatLine[] }[] }
    | undefined;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    if (list) blocks.push({ kind: 'list', ...list });
    paragraph = [];
    list = undefined;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '  ').trimEnd();
    if (line.trim() === '') {
      // Una línea en blanco cierra el párrafo, pero no la lista: el agente suele separar los
      // ítems con una línea vacía. La lista se cierra con la próxima línea que no sea un ítem.
      if (!list) flush();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const indent = (bullet?.[1] ?? numbered?.[1] ?? /^\s*/.exec(line)?.[0] ?? '').length;
    const item = bullet?.[2] ?? numbered?.[3];
    const parent = list?.items.at(-1);

    // Sub-ítem o línea con sangría: va dentro del ítem anterior.
    if (parent && indent >= NESTED_INDENT) {
      parent.children.push(parseLine(item ?? line.trim()));
      continue;
    }
    if (item !== undefined) {
      const ordered = numbered !== null;
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, start: Number(numbered?.[2] ?? 1), items: [] };
      list.items.push({ line: parseLine(item), children: [] });
      continue;
    }
    if (list) flush();
    paragraph.push(parseLine(line.trim()));
  }
  flush();
  return blocks;
}

/** Ruta relativa si el link es del propio sitio; `undefined` si es externo. */
export function internalPath(href: string, siteUrl: string): string | undefined {
  const base = siteUrl.replace(/\/+$/, '');
  if (href !== base && !href.startsWith(`${base}/`)) return undefined;
  const path = href.slice(base.length) || '/';
  // `//otro.com` sería un link a otro dominio.
  return path.startsWith('//') ? undefined : path;
}
