import { describe, expect, it } from 'vitest';

import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('leaves plain text untouched, line breaks included', () => {
    expect(htmlToText('Casa en Liniers\n\nCon cochera')).toBe('Casa en Liniers\n\nCon cochera');
  });

  it('turns the HTML of a Tokko description into paragraphs', () => {
    const html =
      '<br> <div><span style="font-size: 14px;">Casa 5 ambientes</span></div><div><br></div>' +
      '<div>Subsuelo: garage para 4 autos</div><div><br></div><div>Planta Baja: living.&nbsp;' +
      '<span style="font-size: 14px;">Cocina</span></div>';
    expect(htmlToText(html)).toBe(
      'Casa 5 ambientes\n\nSubsuelo: garage para 4 autos\n\nPlanta Baja: living. Cocina',
    );
  });

  it('turns list items into bullets', () => {
    expect(htmlToText('<ul><li>Patio</li><li>Quincho</li></ul>')).toBe('• Patio\n• Quincho');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('Ba&ntilde;o &amp; cocina &#8211; 2&#x00BA; piso &aacute;tico')).toBe(
      'Baño & cocina – 2º piso ático',
    );
  });

  it('keeps escaped markup as text instead of parsing it', () => {
    expect(htmlToText('&lt;b&gt;no es negrita&lt;/b&gt;')).toBe('<b>no es negrita</b>');
  });

  it('keeps a "<" that does not open a tag', () => {
    expect(htmlToText('A < 5 cuadras del subte')).toBe('A < 5 cuadras del subte');
  });

  it('drops scripts, styles and comments with their content', () => {
    expect(htmlToText('Hola<script>alert(1)</script><style>p{}</style><!-- nota --> mundo')).toBe(
      'Hola mundo',
    );
  });

  it('leaves unknown entities as they are', () => {
    expect(htmlToText('R&D &foo; &#0;')).toBe('R&D &foo; &#0;');
  });
});
