import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadTranscript, saveTranscript, type ChatEntry } from './transcript';

const store = new Map<string, string>();

beforeEach(() => {
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
  Object.assign(globalThis, { window: { localStorage } });
});

afterEach(() => {
  store.clear();
});

const entry: ChatEntry = {
  id: 'a1',
  role: 'assistant',
  text: 'Mirá esta opción',
  photoUrl: null,
  cards: [
    {
      id: 'p1',
      title: '2 ambientes en Palermo',
      url: 'https://norde.com.ar/propiedades/2-ambientes-palermo',
      photoUrl: null,
      operation: 'Alquiler',
      price: '$ 780.000',
      location: 'Palermo, CABA',
      rooms: 2,
      bedrooms: 1,
      surfaceM2: 48,
    },
  ],
  listingUrl: '/propiedades?operacion=alquiler&zona=Palermo',
  buttons: [],
  error: false,
};

describe('transcript', () => {
  it('remembers the entries with their property cards', () => {
    saveTranscript([entry]);
    expect(loadTranscript()).toEqual([entry]);
  });

  it('reads entries saved before the cards existed', () => {
    const { cards: _cards, listingUrl: _listingUrl, ...older } = entry;
    store.set('norde-chat:v1', JSON.stringify([older]));

    expect(loadTranscript()).toEqual([{ ...entry, cards: [], listingUrl: null }]);
  });

  it('starts empty when the stored value is not valid', () => {
    store.set('norde-chat:v1', '{nope');
    expect(loadTranscript()).toEqual([]);
  });
});
