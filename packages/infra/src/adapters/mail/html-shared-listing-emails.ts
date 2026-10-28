import type {
  ComposedEmail,
  SharedListingEmailContent,
  SharedListingEmails,
} from '@norde/core/clients';
import type { ClientListingOperation } from '@norde/core/clients/contracts';

// Los colores de la marca del sitio (`packages/ui/src/themes/web.css`), en línea: los clientes de
// correo no leen hojas de estilo.
const BRAND = {
  primary: '#c9302b',
  ink: '#2a2522',
  muted: '#6b615a',
  background: '#faf7f2',
  card: '#ffffff',
  border: '#e9e0d5',
} as const;

const OPERATION_LABELS: Readonly<Record<string, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rent: 'Alquiler temporario',
};

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { USD: 'US$', ARS: '$' };

const DEFAULT_MESSAGE = 'Hola, te comparto unas propiedades que pueden interesarte.';

const UNSUBSCRIBE_TEXT =
  'Te llega porque guardamos tus búsquedas. Si no querés recibir más estos emails';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "US$ 120.000"; sin precio, "Consultar". */
function price(operation: ClientListingOperation): string {
  if (operation.priceCents === null) return 'Consultar';
  const amount = Number(operation.priceCents / 100n).toLocaleString('es-AR');
  return `${CURRENCY_SYMBOLS[operation.currency] ?? operation.currency} ${amount}`;
}

function prices(operations: readonly ClientListingOperation[]): string {
  return operations
    .map((op) => `${OPERATION_LABELS[op.operation] ?? op.operation} ${price(op)}`)
    .join(' · ');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * El email de un envío de propiedades: el mensaje del asesor, una tarjeta por propiedad y el botón
 * al link del envío. Texto plano para los clientes que no leen HTML.
 */
export class HtmlSharedListingEmails implements SharedListingEmails {
  compose(content: SharedListingEmailContent): ComposedEmail {
    const message = content.message ?? DEFAULT_MESSAGE;
    const count = content.listings.length;
    const subject =
      content.subject ??
      (count === 1
        ? `${content.companyName}: una propiedad para vos`
        : `${content.companyName}: ${count.toLocaleString('es-AR')} propiedades para vos`);
    const signature = content.advisorName ?? content.companyName;
    const expires = `El link está disponible hasta el ${formatDate(content.expiresAt)}.`;

    const text = [
      message,
      '',
      ...content.listings.flatMap((listing) => [
        `• ${listing.code} · ${listing.title}`,
        `  ${[listing.address, prices(listing.operations)].filter(Boolean).join(' · ')}`,
      ]),
      '',
      `Miralas y contanos cuáles te gustan: ${content.url}`,
      expires,
      '',
      signature,
      ...(content.advisorName === undefined ? [] : [content.companyName]),
      ...(content.unsubscribeUrl === undefined
        ? []
        : ['', `${UNSUBSCRIBE_TEXT}: ${content.unsubscribeUrl}`]),
    ].join('\n');

    // Solo los envíos automáticos llevan el link para darse de baja.
    const unsubscribe =
      content.unsubscribeUrl === undefined
        ? ''
        : `
        <tr><td align="center" style="padding:24px 0 0;font-size:12px;color:${BRAND.muted}">
          ${escapeHtml(UNSUBSCRIBE_TEXT)}: <a href="${escapeHtml(content.unsubscribeUrl)}" style="color:${BRAND.muted}">darme de baja</a>.
        </td></tr>`;

    const cards = content.listings
      .map(
        (listing) => `
          <tr><td style="padding:0 0 12px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px">
              <tr><td style="padding:16px">
                <div style="font-size:12px;color:${BRAND.muted};letter-spacing:.04em">${escapeHtml(listing.code)}</div>
                <div style="font-size:16px;font-weight:600;color:${BRAND.ink};margin:4px 0">${escapeHtml(listing.title)}</div>
                ${listing.address === undefined ? '' : `<div style="font-size:14px;color:${BRAND.muted}">${escapeHtml(listing.address)}</div>`}
                <div style="font-size:14px;color:${BRAND.ink};margin-top:8px">${escapeHtml(prices(listing.operations))}</div>
              </td></tr>
            </table>
          </td></tr>`,
      )
      .join('');

    const paragraphs = message
      .split(/\n+/)
      .map(
        (line) =>
          `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${BRAND.ink}">${escapeHtml(line)}</p>`,
      )
      .join('');

    const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background}">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 0 20px;border-bottom:2px solid ${BRAND.primary}">
          <span style="font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:.02em">${escapeHtml(content.companyName)}</span>
        </td></tr>
        <tr><td style="padding:24px 0 8px">${paragraphs}</td></tr>
        ${cards}
        <tr><td align="center" style="padding:12px 0 8px">
          <a href="${escapeHtml(content.url)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">Ver propiedades</a>
        </td></tr>
        <tr><td align="center" style="padding:4px 0 24px;font-size:13px;color:${BRAND.muted}">Contanos cuáles te gustan desde el link. ${escapeHtml(expires)}</td></tr>
        <tr><td style="padding:16px 0 0;border-top:1px solid ${BRAND.border};font-size:14px;color:${BRAND.ink}">
          ${escapeHtml(signature)}${content.advisorName === undefined ? '' : `<br><span style="color:${BRAND.muted}">${escapeHtml(content.companyName)}</span>`}
        </td></tr>${unsubscribe}
      </table>
    </td></tr>
  </table>
</body></html>`;

    return { subject, text, html };
  }
}
