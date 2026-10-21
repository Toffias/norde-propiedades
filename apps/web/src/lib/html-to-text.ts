// Las descripciones importadas de Tokko (y las que se pegan desde otros sitios) traen HTML
// (`<div>`, `<br>`, `<span style>`, `&nbsp;`). El sitio no renderiza HTML ajeno: lo pasa a texto
// plano conservando los saltos de línea, que la ficha muestra con `whitespace-pre-line`.

const DROPPED_ELEMENTS = /<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const LINE_BREAK = /<br\b[^>]*>/gi;
const LIST_ITEM = /<li\b[^>]*>/gi;
const BLOCK_TAG = /<\/?(p|div|section|article|ul|ol|h[1-6]|tr|table|blockquote|pre|hr)\b[^>]*>/gi;
// Solo lo que arranca con una letra (o `/` + letra) es una etiqueta: "a < 5 cuadras" queda igual.
const ANY_TAG = /<\/?[a-z][^>]*>/gi;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iexcl: '¡',
  iquest: '¿',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  sup2: '²',
  sup3: '³',
  middot: '·',
  bull: '•',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  euro: '€',
};

function decodeEntity(match: string, body: string): string {
  if (body.startsWith('#')) {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  }
  return NAMED_ENTITIES[body] ?? match;
}

/** Texto plano a partir de HTML: saca las etiquetas, decodifica entidades y conserva los párrafos. */
export function htmlToText(html: string): string {
  const text = html
    .replace(DROPPED_ELEMENTS, '')
    .replace(COMMENTS, '')
    .replace(LINE_BREAK, '\n')
    .replace(LIST_ITEM, '\n• ')
    .replace(BLOCK_TAG, '\n')
    .replace(ANY_TAG, '')
    .replace(ENTITY, decodeEntity);
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
