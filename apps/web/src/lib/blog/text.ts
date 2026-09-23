const WORDS_PER_MINUTE = 200;

/** Minutos de lectura (mínimo 1) a partir del texto plano del artículo. */
export function readingTimeMinutes(plainText: string): number {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Resumen para meta description o tarjetas: corta en una palabra completa y agrega "…". */
export function summarize(plainText: string, maxLength = 155): string {
  const text = plainText.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}
