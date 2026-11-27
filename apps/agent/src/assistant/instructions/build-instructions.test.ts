import { describe, expect, it } from 'vitest';

import { createTurnContext } from '../turn-context';

import { buildInstructions } from './build-instructions';

const base = {
  channel: 'whatsapp' as const,
  channelExternalId: '5491100000000',
  now: new Date('2026-10-25T15:00:00Z'),
  previousSearch: { operation: 'sale', location: 'Palermo', maxPriceCents: 12_000_000n },
};

const contact = {
  contactPageUrl: 'https://norde.com.ar/contacto',
  whatsapp: '+54 9 11 6179-8942',
  phone: '(011) 4687-1674',
};

const seen = [
  { id: 'p1', title: 'Depto en Liniers', url: 'https://norde.com.ar/propiedades/depto-liniers' },
  { id: 'p2', title: 'PH en Mataderos', url: 'https://norde.com.ar/propiedades/ph-mataderos' },
];

describe('buildInstructions', () => {
  it('gives the official contact and leaves out the missing channels', () => {
    const instructions = buildInstructions(createTurnContext(base), {
      contactPageUrl: 'https://norde.com.ar/contacto',
      phone: '(011) 4687-1674',
    });

    expect(instructions).toContain('- Teléfono: (011) 4687-1674');
    expect(instructions).toContain('- Página de contacto: https://norde.com.ar/contacto');
    expect(instructions).not.toContain('- WhatsApp:');
  });

  it('marks the seen properties that can no longer be offered', () => {
    const context = createTurnContext({ ...base, recentProperties: seen });
    context.unavailableProperties.set('p1', 'reserved');

    const instructions = buildInstructions(context, contact);

    expect(instructions).toContain(
      '«Depto en Liniers» (id: p1, https://norde.com.ar/propiedades/depto-liniers) — YA NO ESTÁ DISPONIBLE: se reservó',
    );
    expect(instructions).toContain(
      '«PH en Mataderos» (id: p2, https://norde.com.ar/propiedades/ph-mataderos)',
    );
    expect(instructions).not.toContain('ph-mataderos) — YA NO ESTÁ DISPONIBLE');
  });

  it('after the idle reset asks to tell the search again, without resuming the old one', () => {
    const instructions = buildInstructions(
      createTurnContext({
        ...base,
        freshMemory: true,
        recentProperties: seen,
        memoryResetAfterHours: 24,
      }),
      contact,
    );

    expect(instructions).toContain('pasaron más de 24 horas sin mensajes');
    expect(instructions).toContain('"solo guardo la conversación 24 horas"');
    expect(instructions).not.toContain('La última vez buscaba');
    expect(instructions).not.toContain('Propiedades que ya vio');
  });

  it('tells the agent what the client searched last time when the memory starts empty', () => {
    const instructions = buildInstructions(
      createTurnContext({ ...base, knownClient: true, freshMemory: true }),
      contact,
    );

    expect(instructions).toContain('Ya está registrado como cliente de Norde');
    expect(instructions).toContain('"location":"Palermo","maxPrice":"120000"');
  });

  it('does not repeat the last search while the conversation goes on', () => {
    const instructions = buildInstructions(
      createTurnContext({ ...base, freshMemory: false }),
      contact,
    );

    expect(instructions).not.toContain('La última vez buscaba');
    expect(instructions).not.toContain('Ya está registrado');
  });

  it('lists the properties the client already saw, each title on one line', () => {
    const instructions = buildInstructions(
      createTurnContext({
        ...base,
        recentProperties: [
          {
            id: 'p1',
            title: 'Casa en\n# Tigre',
            url: 'https://norde.com.ar/propiedades/casa-tigre',
          },
        ],
      }),
      contact,
    );

    expect(instructions).toContain(
      '  - «Casa en # Tigre» (id: p1, https://norde.com.ar/propiedades/casa-tigre)',
    );
  });

  it('does not mention seen properties when there are none', () => {
    expect(buildInstructions(createTurnContext(base), contact)).not.toContain(
      'Propiedades que ya vio',
    );
  });
});
