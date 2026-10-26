import { describe, expect, it } from 'vitest';

import { createTurnContext } from '../turn-context';

import { buildInstructions } from './build-instructions';

const base = {
  channel: 'whatsapp' as const,
  channelExternalId: '5491100000000',
  now: new Date('2026-10-25T15:00:00Z'),
  previousSearch: { operation: 'sale', location: 'Palermo', maxPriceCents: 12_000_000n },
};

describe('buildInstructions', () => {
  it('tells the agent what the client searched last time when the memory starts empty', () => {
    const instructions = buildInstructions(
      createTurnContext({ ...base, knownClient: true, freshMemory: true }),
    );

    expect(instructions).toContain('Ya está registrado como cliente de Norde');
    expect(instructions).toContain('"location":"Palermo","maxPrice":"120000"');
  });

  it('does not repeat the last search while the conversation goes on', () => {
    const instructions = buildInstructions(createTurnContext({ ...base, freshMemory: false }));

    expect(instructions).not.toContain('La última vez buscaba');
    expect(instructions).not.toContain('Ya está registrado');
  });
});
