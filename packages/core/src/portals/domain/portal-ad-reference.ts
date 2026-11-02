import type { PortalProvider } from './portal';

/**
 * Un aviso de un portal tal como lo nombra un cliente: el link o el número. En MercadoLibre es el
 * id del ítem (`MLA1234567890`); en Zonaprop, el número del aviso que va al final del link.
 */
export type PortalAdReference =
  | { readonly provider: 'mercadolibre'; readonly itemId: string }
  | { readonly provider: 'zonaprop'; readonly postingId: string };

const MERCADOLIBRE_ITEM = /\bMLA-?(\d{6,})\b/i;
const ZONAPROP_LINK = /zonaprop\.com\.ar\/\S*?-(\d{6,})\.html/i;
const ONLY_NUMBER = /^\D*?(\d{6,})\D*$/;

/**
 * Reconoce un aviso en un link o un código (`MLA-123…`). Un número suelto solo se reconoce si se
 * sabe de qué portal es. `undefined`: no parece un aviso de ningún portal.
 */
export function parsePortalAdReference(
  text: string,
  provider?: PortalProvider,
): PortalAdReference | undefined {
  const item = MERCADOLIBRE_ITEM.exec(text)?.[1];
  if (item !== undefined) return { provider: 'mercadolibre', itemId: `MLA${item}` };
  const posting = ZONAPROP_LINK.exec(text)?.[1];
  if (posting !== undefined) return { provider: 'zonaprop', postingId: posting };

  const number = provider === undefined ? undefined : ONLY_NUMBER.exec(text.trim())?.[1];
  if (number === undefined) return undefined;
  return provider === 'mercadolibre'
    ? { provider, itemId: `MLA${number}` }
    : { provider: 'zonaprop', postingId: number };
}
