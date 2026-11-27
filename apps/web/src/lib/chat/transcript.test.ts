import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isTranscriptInactive,
  loadLastActivity,
  loadTranscript,
  loadDraft,
  saveDraft,
  saveLastActivity,
  saveTranscript,
  type ChatEntry,
} from './transcript';

const store = new Map<string, string>();
const session = new Map<string, string>();

function storage(map: Map<string, string>) {
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  };
}

beforeEach(() => {
  Object.assign(globalThis, {
    window: { localStorage: storage(store), sessionStorage: storage(session) },
  });
});

afterEach(() => {
  store.clear();
  session.clear();
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
  busy: false,
};

describe('transcript', () => {
  it('remembers the entries with their property cards', () => {
    saveTranscript([entry]);
    expect(loadTranscript()).toEqual([entry]);
  });

  it('reads entries saved before the cards existed', () => {
    const { cards: _cards, listingUrl: _listingUrl, busy: _busy, ...older } = entry;
    store.set('norde-chat:v1', JSON.stringify([older]));

    expect(loadTranscript()).toEqual([{ ...entry, cards: [], listingUrl: null, busy: false }]);
  });

  it('starts empty when the stored value is not valid', () => {
    store.set('norde-chat:v1', '{nope');
    expect(loadTranscript()).toEqual([]);
  });
});

describe('draft', () => {
  it('keeps the unsent text in the tab and forgets it when emptied', () => {
    saveDraft('Busco 2 ambientes en Liniers');
    expect(loadDraft()).toBe('Busco 2 ambientes en Liniers');
    expect(store.size).toBe(0);

    saveDraft('');
    expect(loadDraft()).toBe('');
  });
});

describe('last activity', () => {
  it('remembers when the last message was and forgets it on a new chat', () => {
    saveLastActivity(1_700_000_000_000);
    expect(loadLastActivity()).toBe(1_700_000_000_000);

    saveLastActivity(null);
    expect(loadLastActivity()).toBeNull();
  });

  it('ignores an invalid stored value', () => {
    store.set('norde-chat:last-activity', 'ayer');
    expect(loadLastActivity()).toBeNull();
  });
});

describe('isTranscriptInactive', () => {
  const HOUR = 3_600_000;
  const now = 1_700_000_000_000;

  it('is inactive once the idle period of the agent has passed', () => {
    const input = { entries: [entry], now, idleResetMs: 24 * HOUR };

    expect(isTranscriptInactive({ ...input, lastActivityAt: now - 23 * HOUR })).toBe(false);
    expect(isTranscriptInactive({ ...input, lastActivityAt: now - 25 * HOUR })).toBe(true);
  });

  it('takes a saved chat without its last activity as inactive, but never an empty one', () => {
    expect(
      isTranscriptInactive({ entries: [entry], lastActivityAt: null, now, idleResetMs: HOUR }),
    ).toBe(true);
    expect(
      isTranscriptInactive({ entries: [], lastActivityAt: null, now, idleResetMs: HOUR }),
    ).toBe(false);
  });
});
