import { describe, expect, it } from 'vitest';

import { HtmlSubscriptionConfirmationEmails } from './html-subscription-confirmation-emails';

const CONTENT = {
  companyName: 'Norde Propiedades',
  firstName: 'Ana',
  searchSummary: 'Departamentos en venta en <Palermo>',
  frequencyLabel: 'una vez por semana',
  confirmUrl: 'https://norde.com.ar/suscripcion/abc',
  expiresAt: new Date('2026-11-07T15:00:00Z'),
};

describe('HtmlSubscriptionConfirmationEmails', () => {
  it('asks to confirm with the search, the frequency and the link', () => {
    const email = new HtmlSubscriptionConfirmationEmails().compose(CONTENT);

    expect(email.subject).toBe('Confirmá tu suscripción a Norde Propiedades');
    expect(email.text).toContain('¡Hola, Ana!');
    expect(email.text).toContain('una vez por semana');
    expect(email.text).toContain('https://norde.com.ar/suscripcion/abc');
    expect(email.text).toContain('El link vence el 7 de noviembre');
    expect(email.html).toContain('href="https://norde.com.ar/suscripcion/abc"');
  });

  it('escapes what comes from the web', () => {
    const email = new HtmlSubscriptionConfirmationEmails().compose(CONTENT);

    expect(email.html).toContain('en &lt;Palermo&gt;');
    expect(email.html).not.toContain('<Palermo>');
  });

  it('greets without a name', () => {
    const email = new HtmlSubscriptionConfirmationEmails().compose({
      ...CONTENT,
      firstName: undefined,
    });

    expect(email.text.startsWith('¡Hola!')).toBe(true);
  });
});
