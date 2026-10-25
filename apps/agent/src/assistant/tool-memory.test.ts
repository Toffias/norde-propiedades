import { describe, expect, it } from 'vitest';

import { compactToolOutput } from './tool-memory';

const property = {
  id: 'p1',
  title: '2 ambientes en Palermo',
  price: 'USD 120.000',
  url: 'https://norde.com.ar/propiedades/p1',
  description: 'Muy luminoso…',
  amenities: ['balcón'],
};

describe('compactToolOutput', () => {
  it('keeps id, title, price and link of each search result', () => {
    const output = JSON.stringify({ total: 9, page: 1, hasMore: true, items: [property] });

    expect(JSON.parse(compactToolOutput('search_properties', output))).toEqual({
      total: 9,
      page: 1,
      items: [
        { id: 'p1', title: '2 ambientes en Palermo', price: 'USD 120.000', url: property.url },
      ],
    });
  });

  it('drops the description of a property detail', () => {
    expect(compactToolOutput('get_property', JSON.stringify(property))).not.toContain('luminoso');
  });

  it('leaves other tools and unexpected outputs untouched', () => {
    expect(compactToolOutput('register_client', '{"ok":true}')).toBe('{"ok":true}');
    expect(compactToolOutput('search_properties', 'no es JSON')).toBe('no es JSON');
  });
});
