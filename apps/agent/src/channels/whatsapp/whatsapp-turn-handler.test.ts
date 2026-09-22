import {
  assistantMessage,
  functionCall,
  modelError,
  ScriptedModel,
} from '@norde/agent-kit/testing';
import { RegisterContact } from '@norde/core/clients';
import { InMemoryClientsUnitOfWork } from '@norde/core/clients/testing';
import { ReceiveInboundMessages, SendReply, type InboundMessage } from '@norde/core/conversations';
import {
  InMemoryConversationsUnitOfWork,
  RecordingMessenger,
} from '@norde/core/conversations/testing';
import { GetPropertyDetail, SearchProperties } from '@norde/core/properties';
import { aPropertyRecord, InMemoryPropertySearchQuery } from '@norde/core/properties/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock, SequentialIdGenerator } from '@norde/core/shared/testing';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { createCustomerAssistant } from '../../assistant/customer-assistant';

import { FailureBreaker } from './failure-breaker';
import type { WhatsAppInbound } from './inbound';
import { NOTICE_TEXT, NoticeThrottle } from './notices';
import { FALLBACK_TEXT } from './reply-builder';
import { WhatsAppTurnHandler } from './whatsapp-turn-handler';

const PHONE = '5491166899124';
const HOUR = 3_600_000;
const actor = Actor.system('agent-ia', [
  'properties:read',
  'clients:create',
  'conversations:receive',
  'conversations:reply',
]);

const palermo = aPropertyRecord({
  title: '2 ambientes en Palermo',
  slug: '2-ambientes-palermo',
  neighborhood: 'Palermo',
  priceCents: 78_000_000n,
  imageUrls: ['https://cdn.norde.com.ar/p1.jpg'],
});

const NO_FILTERS = {
  operation: null,
  propertyType: null,
  location: null,
  minPrice: null,
  maxPrice: null,
  currency: null,
  minRooms: null,
  maxRooms: null,
  minBedrooms: null,
  minSurface: null,
  amenities: null,
  page: null,
};

function setup(options: { breakerThreshold?: number } = {}) {
  const model = new ScriptedModel();
  const clock = new FixedClock('2026-03-01T13:00:00Z');
  const ids = new SequentialIdGenerator();
  const messenger = new RecordingMessenger();
  const messengers = { whatsapp: messenger };
  const clients = new InMemoryClientsUnitOfWork();
  const conversations = new InMemoryConversationsUnitOfWork();
  const properties = new InMemoryPropertySearchQuery([palermo]);
  const toolErrors: string[] = [];

  const assistant = createCustomerAssistant({
    model: { instance: model },
    maxMemoryItems: 60,
    onToolError: (tool) => toolErrors.push(tool),
    actor,
    siteUrl: 'https://norde.com.ar',
    searchProperties: new SearchProperties({ properties }),
    getPropertyDetail: new GetPropertyDetail({ properties }),
    registerContact: new RegisterContact({ uow: clients, ids, clock }),
  });
  const handler = new WhatsAppTurnHandler({
    receiveInbound: new ReceiveInboundMessages({
      uow: conversations,
      ids,
      clock,
      messengers,
      policy: {
        idleResetAfterMs: 24 * HOUR,
        maxInboundAgeMs: 12 * HOUR,
        maxInboundTextChars: 1000,
        usageLimits: {
          whatsapp: { perContactPerHour: 30, perContactPerDay: 120, outboundPerDay: 3000 },
        },
      },
    }),
    sendReply: new SendReply({ uow: conversations, ids, clock, messengers }),
    assistant,
    actor,
    breaker: new FailureBreaker(options.breakerThreshold ?? 5, 10 * 60_000),
    notices: new NoticeThrottle(HOUR),
    now: () => clock.now(),
    logger: pino({ level: 'silent' }),
  });

  let sequence = 0;
  const inbound = (text: string, overrides: Partial<InboundMessage> = {}): WhatsAppInbound => ({
    phoneNumberId: 'PNID',
    from: PHONE,
    profileName: 'Ana',
    message: {
      channelMessageId: `wamid.${++sequence}`,
      kind: 'text',
      text,
      sentAt: clock.now(),
      rawType: 'text',
      ...overrides,
    },
  });
  const conversation = () => [...conversations.conversations.rows.values()][0];

  return { model, messenger, clients, conversations, handler, inbound, conversation, toolErrors };
}

describe('WhatsAppTurnHandler', () => {
  it('searches the stock and answers with a single message', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [
        functionCall(
          'search_properties',
          { ...NO_FILTERS, operation: 'rent', propertyType: 'apartment', location: 'Palermo' },
          { callId: 'call-1' },
        ),
      ],
      [assistantMessage('Encontré 1 opción:\n1. **2 ambientes en Palermo**')],
    );

    await ctx.handler.handle([
      ctx.inbound('hola'),
      ctx.inbound('busco 2 amb en alquiler en palermo'),
    ]);

    expect(ctx.messenger.sent).toEqual([
      {
        to: PHONE,
        message: { type: 'text', text: 'Encontré 1 opción:\n1. *2 ambientes en Palermo*' },
      },
    ]);
    // El modelo recibió los dos mensajes juntos y el resultado de la búsqueda.
    const firstRequest = JSON.stringify(ctx.model.firstCall?.request.input);
    expect(firstRequest).toContain('hola\\nbusco 2 amb en alquiler en palermo');
    expect(JSON.stringify(ctx.model.lastCall?.request.input)).toContain(
      'https://norde.com.ar/propiedades/2-ambientes-palermo',
    );
    expect(ctx.conversation()).toMatchObject({
      contactName: 'Ana',
      searchCriteria: { operation: 'rent', propertyType: 'apartment', location: 'Palermo' },
    });
    expect(ctx.conversation()?.agentMemory.length).toBeGreaterThan(2);
    expect(ctx.conversations.messages.outbound).toHaveLength(1);
  });

  it('registers the client with the last search and links the conversation', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [
        functionCall(
          'search_properties',
          { ...NO_FILTERS, operation: 'rent', location: 'Palermo' },
          { callId: 'c1' },
        ),
      ],
      [assistantMessage('Tengo esta opción en Palermo.')],
      [
        functionCall(
          'register_client',
          {
            type: 'rent',
            intent: 'visit',
            name: null,
            email: null,
            phone: null,
            propertyId: palermo.id,
            notes: 'Quiere visitar el sábado a la mañana',
            noMatchingStock: false,
          },
          { callId: 'c2' },
        ),
      ],
      [assistantMessage('¡Listo, Ana! Un asesor te va a escribir para coordinar la visita.')],
    );

    await ctx.handler.handle([ctx.inbound('busco alquilar en palermo')]);
    await ctx.handler.handle([ctx.inbound('quiero visitarla el sábado')]);

    const [client] = [...ctx.clients.clients.rows.values()];
    const [opportunity] = [...ctx.clients.opportunities.rows.values()];
    expect(client).toMatchObject({ name: 'Ana' });
    expect(client?.phone?.e164).toBe('+5491166899124');
    expect(client?.channels).toMatchObject([{ channel: 'whatsapp', externalId: PHONE }]);
    expect(opportunity).toMatchObject({
      type: 'rent',
      intent: 'visit',
      status: 'new',
      originChannel: 'whatsapp',
      propertyId: palermo.id,
      search: { operation: 'rent', location: 'Palermo' },
    });
    expect(ctx.conversation()?.clientId).toBe(client?.id);
    expect(ctx.clients.events.published.map((e) => e.type)).toContain(
      'clients.opportunity_created',
    );
    expect(ctx.messenger.sent.at(-1)?.message).toMatchObject({ type: 'text' });
  });

  it('sends the photo with the text as caption', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [functionCall('show_photo', { propertyId: palermo.id }, { callId: 'c1' })],
      [assistantMessage('Así es el living.')],
    );

    await ctx.handler.handle([ctx.inbound('¿tenés fotos?')]);

    expect(ctx.messenger.sent[0]?.message).toEqual({
      type: 'image',
      imageUrl: 'https://cdn.norde.com.ar/p1.jpg',
      caption: 'Así es el living.',
    });
  });

  it('closes with buttons when the agent offers closed options', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [functionCall('offer_buttons', { options: ['Comprar', 'Alquilar'] }, { callId: 'c1' })],
      [assistantMessage('¿Buscás comprar o alquilar?')],
    );

    await ctx.handler.handle([ctx.inbound('hola')]);

    expect(ctx.messenger.sent[0]?.message).toEqual({
      type: 'buttons',
      text: '¿Buscás comprar o alquilar?',
      buttons: [
        { id: 'opt_1', title: 'Comprar' },
        { id: 'opt_2', title: 'Alquilar' },
      ],
    });
  });

  it('tells the model when a property does not exist instead of failing', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [functionCall('get_property', { propertyId: 'P-999' }, { callId: 'c1' })],
      [assistantMessage('No encuentro esa propiedad.')],
    );

    await ctx.handler.handle([ctx.inbound('¿y la P-999?')]);

    expect(JSON.stringify(ctx.model.lastCall?.request.input)).toContain(
      'No hay una propiedad publicada',
    );
    expect(ctx.toolErrors).toEqual([]);
  });

  it('sends a fallback when the agent fails, and stops once the breaker opens', async () => {
    const ctx = setup({ breakerThreshold: 2 });
    ctx.model.enqueue(modelError(new Error('503')), modelError(new Error('503')));

    await ctx.handler.handle([ctx.inbound('hola')]);
    await ctx.handler.handle([ctx.inbound('¿hola?')]);
    await ctx.handler.handle([ctx.inbound('¿hay alguien?')]);

    expect(ctx.messenger.sent.map((s) => s.message)).toEqual([
      { type: 'text', text: FALLBACK_TEXT },
    ]);
    // El turno fallido no queda en la memoria.
    expect(ctx.conversation()?.agentMemory).toEqual([]);
  });

  it('does not answer acknowledgements nor redeliveries', async () => {
    const ctx = setup();
    const thanks = ctx.inbound('gracias!');

    await ctx.handler.handle([thanks]);
    await ctx.handler.handle([thanks]);

    expect(ctx.messenger.sent).toEqual([]);
    expect(ctx.model.calls).toHaveLength(0);
  });

  it('answers unsupported content with a notice, at most once per hour', async () => {
    const ctx = setup();
    const audio = () => ctx.inbound('', { kind: 'unsupported', rawType: 'audio' });

    await ctx.handler.handle([audio()]);
    await ctx.handler.handle([audio()]);

    expect(ctx.messenger.sent.map((s) => s.message)).toEqual([
      { type: 'text', text: NOTICE_TEXT.unsupported_content },
    ]);
  });

  it('stays silent while a person handles the conversation', async () => {
    const ctx = setup();
    ctx.model.enqueue([assistantMessage('¡Hola!')]);
    await ctx.handler.handle([ctx.inbound('hola')]);
    const row = ctx.conversation();
    if (row) ctx.conversations.conversations.rows.set(row.id, { ...row, status: 'handed_off' });

    await ctx.handler.handle([ctx.inbound('¿sigue disponible?')]);

    expect(ctx.messenger.sent).toHaveLength(1);
    expect(ctx.model.calls).toHaveLength(1);
  });
});
