/**
 * Iniciales para el avatar: "Ana María Pérez" → "AP"; "Ana" → "A". Solo cuentan las palabras que
 * empiezan con una letra o un número: "Martín G. (prueba)" → "MG".
 */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word));
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
