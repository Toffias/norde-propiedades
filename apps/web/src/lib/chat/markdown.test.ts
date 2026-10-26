import { describe, expect, it } from 'vitest';

import { internalPath, isAllowedExternalLink, parseChatMarkdown, parseLine } from './markdown';

const text = (value: string, bold = false) => ({ kind: 'text', text: value, bold });
const link = (value: string, href: string, bold = false) => ({
  kind: 'link',
  text: value,
  href,
  bold,
});

describe('parseLine', () => {
  it('splits bold segments and links, also a link inside bold', () => {
    expect(parseLine('Mirá **[2 ambientes](https://norde.com.ar/propiedades/x)** hoy')).toEqual([
      text('Mirá '),
      link('2 ambientes', 'https://norde.com.ar/propiedades/x', true),
      text(' hoy'),
    ]);
  });

  it('links bare URLs without the trailing punctuation', () => {
    expect(parseLine('Ficha: https://norde.com.ar/propiedades/x.')).toEqual([
      text('Ficha: '),
      link('https://norde.com.ar/propiedades/x', 'https://norde.com.ar/propiedades/x'),
      text('.'),
    ]);
  });

  it('keeps an unclosed ** as text and drops headings', () => {
    expect(parseLine('## Precio **USD 100')).toEqual([text('Precio '), text('**USD 100')]);
  });

  it('never links other protocols', () => {
    expect(parseLine('[clic](javascript:alert(1))')).toEqual([text('[clic](javascript:alert(1))')]);
  });
});

describe('parseChatMarkdown', () => {
  it('groups paragraphs, bullet lists and numbered lists', () => {
    const blocks = parseChatMarkdown(
      'Encontré 2 opciones:\n1. **Palermo**\n2. Belgrano\n\n- Ver más\n- Ajustar\nHay 3 más.',
    );

    expect(blocks).toEqual([
      { kind: 'paragraph', lines: [[text('Encontré 2 opciones:')]] },
      {
        kind: 'list',
        ordered: true,
        start: 1,
        items: [
          { line: [text('Palermo', true)], children: [] },
          { line: [text('Belgrano')], children: [] },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [
          { line: [text('Ver más')], children: [] },
          { line: [text('Ajustar')], children: [] },
        ],
      },
      { kind: 'paragraph', lines: [[text('Hay 3 más.')]] },
    ]);
  });

  it('nests indented lines under the previous item and keeps the numbering', () => {
    const blocks = parseChatMarkdown(
      '1. **Palermo**  \n   - Precio: USD 100\n   Barrio: Palermo\n\n2. Belgrano\n\n- Ver más',
    );

    expect(blocks).toEqual([
      {
        kind: 'list',
        ordered: true,
        start: 1,
        items: [
          {
            line: [text('Palermo', true)],
            children: [[text('Precio: USD 100')], [text('Barrio: Palermo')]],
          },
          { line: [text('Belgrano')], children: [] },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [{ line: [text('Ver más')], children: [] }],
      },
    ]);
  });

  it('starts a numbered list where the agent left off', () => {
    expect(parseChatMarkdown('Más opciones:\n4. Núñez')).toEqual([
      { kind: 'paragraph', lines: [[text('Más opciones:')]] },
      { kind: 'list', ordered: true, start: 4, items: [{ line: [text('Núñez')], children: [] }] },
    ]);
  });

  it('keeps line breaks inside a paragraph', () => {
    expect(parseChatMarkdown('Hola\r\n¿qué buscás?')).toEqual([
      { kind: 'paragraph', lines: [[text('Hola')], [text('¿qué buscás?')]] },
    ]);
  });
});

describe('internalPath', () => {
  it('turns links to the site into relative paths and leaves the rest out', () => {
    const site = 'https://norde.com.ar/';
    expect(internalPath('https://norde.com.ar/propiedades/x', site)).toBe('/propiedades/x');
    expect(internalPath('https://norde.com.ar', site)).toBe('/');
    expect(internalPath('https://norde.com.ar.evil.com/x', site)).toBeUndefined();
    expect(internalPath('https://maps.google.com', site)).toBeUndefined();
    expect(internalPath('https://norde.com.ar//evil.com', site)).toBeUndefined();
  });
});

describe('isAllowedExternalLink', () => {
  it('allows WhatsApp links only', () => {
    expect(isAllowedExternalLink('https://wa.me/5491100000000')).toBe(true);
    expect(isAllowedExternalLink('https://evil.example/pago')).toBe(false);
    expect(isAllowedExternalLink('http://wa.me/5491100000000')).toBe(false);
    expect(isAllowedExternalLink('https://wa.me@evil.example/')).toBe(false);
    expect(isAllowedExternalLink('no es una url')).toBe(false);
  });
});
