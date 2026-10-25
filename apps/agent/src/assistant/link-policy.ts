/** Hosts externos a los que el agente puede mandar al cliente, además del propio sitio. */
const EXTERNAL_HOSTS = new Set(['wa.me']);

// Un link markdown con URL http(s), o una URL suelta (sin la puntuación final).
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?¡¿"'])/g;

/**
 * Deja solo los links al sitio de Norde (y a WhatsApp). Si un mensaje del cliente o un dato
 * manipularon al modelo, no puede mostrarle al cliente un link de phishing con la marca de Norde:
 * un link markdown queda como su texto y una URL suelta se quita.
 */
export function keepAllowedLinks(
  text: string,
  siteUrl: string,
): { readonly text: string; readonly removed: number } {
  const siteHost = new URL(siteUrl).host;
  let removed = 0;
  const kept = text.replace(LINK, (whole, label: string | undefined, href: string | undefined) => {
    const url = href ?? whole;
    if (isAllowed(url, siteHost)) return whole;
    removed += 1;
    return label ?? '';
  });
  return { text: removed > 0 ? kept.replace(/[ \t]{2,}/g, ' ') : text, removed };
}

function isAllowed(url: string, siteHost: string): boolean {
  try {
    const { host, username, password } = new URL(url);
    // `https://norde.com.ar@otro.com` muestra el dominio de Norde pero abre otro.
    if (username !== '' || password !== '') return false;
    return host === siteHost || host === `www.${siteHost}` || EXTERNAL_HOSTS.has(host);
  } catch {
    return false;
  }
}
