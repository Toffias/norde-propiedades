import type {
  SubscriptionConfirmationContent,
  SubscriptionConfirmationEmail,
  SubscriptionConfirmationEmails,
} from '@norde/core/clients';

// Los colores de la marca del sitio (`packages/ui/src/themes/web.css`), en línea: los clientes de
// correo no leen hojas de estilo. Los mismos que el email de los envíos.
const BRAND = {
  primary: '#c9302b',
  ink: '#2a2522',
  muted: '#6b615a',
  background: '#faf7f2',
  border: '#e9e0d5',
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * El email que pide confirmar una suscripción a una búsqueda desde la web (#208): qué búsqueda,
 * cada cuánto y el botón al link. Texto plano para los clientes que no leen HTML.
 */
export class HtmlSubscriptionConfirmationEmails implements SubscriptionConfirmationEmails {
  compose(content: SubscriptionConfirmationContent): SubscriptionConfirmationEmail {
    const subject = `Confirmá tu suscripción a ${content.companyName}`;
    const greeting = content.firstName === undefined ? '¡Hola!' : `¡Hola, ${content.firstName}!`;
    const intro = `Pediste recibir ${content.frequencyLabel} las propiedades nuevas y las bajas de precio de esta búsqueda:`;
    const expires = `El link vence el ${formatDateTime(content.expiresAt)}.`;
    const ignore = 'Si no fuiste vos, ignorá este email: no te vamos a mandar nada.';

    const text = [
      greeting,
      '',
      intro,
      content.searchSummary,
      '',
      `Confirmá tu email desde este link: ${content.confirmUrl}`,
      expires,
      '',
      ignore,
      '',
      content.companyName,
    ].join('\n');

    const paragraph = (value: string, extra = '') =>
      `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${BRAND.ink}${extra}">${escapeHtml(value)}</p>`;

    const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background}">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 0 20px;border-bottom:2px solid ${BRAND.primary}">
          <span style="font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:.02em">${escapeHtml(content.companyName)}</span>
        </td></tr>
        <tr><td style="padding:24px 0 8px">
          ${paragraph(greeting)}
          ${paragraph(intro)}
          ${paragraph(content.searchSummary, ';font-weight:600')}
        </td></tr>
        <tr><td align="center" style="padding:12px 0 8px">
          <a href="${escapeHtml(content.confirmUrl)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">Confirmar suscripción</a>
        </td></tr>
        <tr><td align="center" style="padding:4px 0 24px;font-size:13px;color:${BRAND.muted}">${escapeHtml(expires)}</td></tr>
        <tr><td style="padding:16px 0 0;border-top:1px solid ${BRAND.border};font-size:13px;color:${BRAND.muted}">
          ${escapeHtml(ignore)}<br>${escapeHtml(content.companyName)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    return { subject, text, html };
  }
}
