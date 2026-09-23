import { describe, expect, it } from 'vitest';

import { BUSINESS } from '../../constants/business';
import { buildLlmsTxt } from './llms-txt';

const SITE = 'https://norde.com.ar';

describe('buildLlmsTxt', () => {
  it('describes the business and links the main pages', () => {
    const text = buildLlmsTxt(SITE, { categories: [], posts: [] });
    expect(text.startsWith(`# ${BUSINESS.name}\n\n> ${BUSINESS.description}`)).toBe(true);
    expect(text).toContain('[Blog](https://norde.com.ar/blog)');
    expect(text).not.toContain('## Guías');
  });

  it('lists the blog topics and guides', () => {
    const text = buildLlmsTxt(SITE, {
      categories: [{ title: 'Alquilar', slug: 'alquilar' }],
      posts: [
        { title: 'Aumento por IPC', slug: 'aumento-ipc', description: 'Cómo se calcula.' },
        { title: 'Sin resumen', slug: 'sin-resumen', description: null },
      ],
    });
    expect(text).toContain('- [Alquilar](https://norde.com.ar/blog/categoria/alquilar)');
    expect(text).toContain(
      '- [Aumento por IPC](https://norde.com.ar/blog/aumento-ipc): Cómo se calcula.',
    );
    expect(text).toContain('- [Sin resumen](https://norde.com.ar/blog/sin-resumen)\n');
  });

  it('includes only the contact data that exists', () => {
    const text = buildLlmsTxt(
      SITE,
      { categories: [], posts: [] },
      { ...BUSINESS, whatsapp: '5491100000000', email: null, telephone: null, address: null },
    );
    expect(text).toContain('- WhatsApp: https://wa.me/5491100000000');
    expect(text).not.toContain('Email');
  });
});
