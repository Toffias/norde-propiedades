import { describe, expect, it } from 'vitest';

import type { ShownProperty } from '../../assistant/turn-context';

import { buildWebChatReply, mentionedProperties } from './reply-builder';

const SITE = 'https://norde.com.ar';

function shown(slug: string): ShownProperty {
  return {
    id: `id-${slug}`,
    title: slug,
    url: `${SITE}/propiedades/${slug}`,
    photoUrl: null,
    operation: 'Venta',
    price: 'USD 100.000',
    location: 'Palermo, CABA',
    rooms: 2,
    bedrooms: 1,
    surfaceM2: 50,
  };
}

describe('mentionedProperties', () => {
  const a = shown('casa-p-01');
  const b = shown('casa-p-010');
  const c = shown('ph-p-02');

  it('keeps only the properties linked in the text, in the order of the text', () => {
    const text = `1. [PH](${SITE}/propiedades/ph-p-02)\n2. [Casa](${SITE}/propiedades/casa-p-010)`;

    expect(mentionedProperties(text, [a, b, c]).map((p) => p.id)).toEqual([c.id, b.id]);
  });

  it('accepts links without the domain', () => {
    expect(mentionedProperties('Mirá [esta](/propiedades/casa-p-01).', [a, b])).toEqual([a]);
  });

  it('returns no cards when the text links no property', () => {
    expect(mentionedProperties('Hay 3 opciones, ¿te las muestro?', [a, b, c])).toEqual([]);
  });
});

describe('buildWebChatReply', () => {
  it('adds the cards to the view but stores only the text', () => {
    const property = shown('ph-p-02');
    const text = `Te muestro [este PH](${property.url}).`;

    const reply = buildWebChatReply(text, {
      photo: undefined,
      buttons: undefined,
      shownProperties: new Map([[property.id, property]]),
    });

    expect(reply.view.cards).toEqual([property]);
    expect(reply.stored).toEqual({ type: 'text', text });
  });
});
