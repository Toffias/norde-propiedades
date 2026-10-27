import { describe, expect, it } from 'vitest';

import { HtmlSharedListingEmails } from './html-shared-listing-emails';

const listing = {
  id: '00000000-0000-7000-8000-0000000000e1',
  code: 'NOR-001',
  title: 'Departamento <3> ambientes',
  address: 'Gorriti 4500',
  status: 'available',
  operations: [
    { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
    { operation: 'rent', currency: 'ARS', priceCents: null },
  ],
  cover: undefined,
  producer: undefined,
};

const content = {
  companyName: 'Norde Propiedades',
  advisorName: 'Camila',
  message: 'Hola Ana,\nmirá estas',
  subject: undefined,
  url: 'https://norde.com.ar/e/abc',
  expiresAt: new Date('2026-05-30T12:00:00Z'),
  listings: [listing],
};

describe('HtmlSharedListingEmails', () => {
  it('writes the message, the properties and the link, escaping what came from the panel', () => {
    const email = new HtmlSharedListingEmails().compose(content);

    expect(email.subject).toBe('Norde Propiedades: una propiedad para vos');
    expect(email.html).toContain('Departamento &lt;3&gt; ambientes');
    expect(email.html).not.toContain('<3>');
    expect(email.html).toContain('href="https://norde.com.ar/e/abc"');
    expect(email.html).toContain('Venta US$ 120.000 · Alquiler Consultar');
    expect(email.text).toContain('Hola Ana,\nmirá estas');
    expect(email.text).toContain('https://norde.com.ar/e/abc');
    expect(email.text).toContain('30 de mayo de 2026');
    expect(email.text).toContain('Camila\nNorde Propiedades');
  });

  it('uses a default message and counts several properties', () => {
    const email = new HtmlSharedListingEmails().compose({
      ...content,
      message: undefined,
      advisorName: undefined,
      listings: [listing, { ...listing, code: 'NOR-002' }],
    });

    expect(email.subject).toBe('Norde Propiedades: 2 propiedades para vos');
    expect(email.text).toContain('te comparto unas propiedades');
  });

  it('uses the chosen subject', () => {
    const email = new HtmlSharedListingEmails().compose({ ...content, subject: 'Lo que hablamos' });

    expect(email.subject).toBe('Lo que hablamos');
  });
});
