const MAX_NAME_CHARS = 40;

/**
 * El nombre del contacto tal como puede entrar en las instrucciones. En WhatsApp es el nombre de
 * perfil, que elige el cliente: se dejan solo letras, espacios, apóstrofos, puntos y guiones, y
 * se recorta, para que no pueda colar instrucciones ni formato. `undefined` si no queda nada.
 */
export function sanitizeContactName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const clean = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}' .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_CHARS)
    .trim();
  return /\p{L}/u.test(clean) ? clean : undefined;
}
