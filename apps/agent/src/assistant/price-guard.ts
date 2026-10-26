// Un monto con moneda: "USD 120.000", "U$S 95.000", "$ 550.000", "$550000".
const AMOUNT = /(?:USD|U\$S|US\$|\$)\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})/giu;

/**
 * Montos de la respuesta del agente que no aparecen en lo que vio el turno (los resultados de las
 * tools y los mensajes del cliente). No frena la respuesta: es una señal para revisar si el modelo
 * inventó un precio.
 */
export function unverifiedAmounts(text: string, seen: readonly unknown[]): string[] {
  const known = digitsOnly(JSON.stringify(seen));
  return [...text.matchAll(AMOUNT)]
    .map((match) => match[0])
    .filter((amount) => !known.includes(digitsOnly(amount)));
}

/** Cada número del texto, sin separadores de miles, entre barras: `|120000|550000|`. */
function digitsOnly(text: string): string {
  const numbers = text.match(/\d+(?:[.,]\d{3})*/gu) ?? [];
  return `|${numbers.map((n) => n.replace(/[.,]/g, '')).join('|')}|`;
}
