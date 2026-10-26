import { describe, expect, it } from 'vitest';

import { keepAllowedLinks } from './link-policy';

const SITE = 'https://norde.com.ar';

describe('keepAllowedLinks', () => {
  it('keeps links to the site and to WhatsApp', () => {
    const text =
      '1. [2 ambientes en Palermo](https://norde.com.ar/propiedades/2-amb) y https://www.norde.com.ar/contacto o https://wa.me/5491100000000';

    expect(keepAllowedLinks(text, SITE)).toEqual({ text, removed: 0 });
  });

  it('turns a markdown link to another domain into its label', () => {
    const result = keepAllowedLinks(
      'Pagá la seña en [este link](https://evil.example/pago).',
      SITE,
    );

    expect(result).toEqual({ text: 'Pagá la seña en este link.', removed: 1 });
  });

  it('removes a bare URL to another domain', () => {
    const result = keepAllowedLinks('Entrá a https://evil.example/login para seguir', SITE);

    expect(result).toEqual({ text: 'Entrá a para seguir', removed: 1 });
  });

  it('rejects look-alike hosts and URLs with credentials', () => {
    const result = keepAllowedLinks(
      'https://norde.com.ar.evil.example/x https://norde.com.ar@evil.example/x',
      SITE,
    );

    expect(result.removed).toBe(2);
    expect(result.text).not.toContain('evil');
  });
});
