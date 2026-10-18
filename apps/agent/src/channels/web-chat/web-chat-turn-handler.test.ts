import {
  assistantMessage,
  functionCall,
  modelError,
  ScriptedModel,
} from '@norde/agent-kit/testing';
import { RegisterContact } from '@norde/core/clients';
import { InMemoryClientsUnitOfWork } from '@norde/core/clients/testing';
import { ReceiveInboundMessages, SendReply, type UsageLimits } from '@norde/core/conversations';
import {
  InMemoryConversationsUnitOfWork,
  RecordingMessenger,
} from '@norde/core/conversations/testing';
import { GetPropertyDetail, SearchProperties } from '@norde/core/properties';
import {
  aPropertyMediaRecord,
  aPropertyRecord,
  InMemoryPropertySearchQuery,
} from '@norde/core/properties/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock, SequentialIdGenerator } from '@norde/core/shared/testing';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { createCustomerAssistant } from '../../assistant/customer-assistant';
import { FailureBreaker } from '../shared/failure-breaker';

import { FALLBACK_TEXT } from './reply-builder';
import { WebChatTurnHandler } from './web-chat-turn-handler';

const SESSION = '00000000-0000-4000-8000-0000000000a1';
const HOUR = 3_600_000;
const actor = Actor.system('agent-ia', [
  'properties:read',
  'clients:create',
  'conversations:receive',
  'conversations:reply',
]);

const cover = aPropertyMediaRecord({ updatedAt: new Date('2026-10-01T12:00:00Z') });
const COVER_URL = `https://norde.com.ar/fotos/${cover.id}/${cover.updatedAt.getTime().toString(36)}`;

const palermo = aPropertyRecord({
  title: '2 ambientes en Palermo',
  slug: '2-ambientes-palermo',
  neighborhood: 'Palermo',
  operations: [
    { operation: 'rent', priceCents: 78_000_000n, currency: 'ARS', priceOnRequest: false },
  ],
  media: [cover],
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

function setup(options: { breakerThreshold?: number; limits?: Partial<UsageLimits> } = {}) {
  const model = new ScriptedModel();
  const clock = new FixedClock('2026-03-01T13:00:00Z');
  const ids = new SequentialIdGenerator();
  const messenger = new RecordingMessenger();
  const messengers = { web_chat: messenger };
  const clients = new InMemoryClientsUnitOfWork();
  const conversations = new InMemoryConversationsUnitOfWork();
  const properties = new InMemoryPropertySearchQuery([palermo]);

  const assistant = createCustomerAssistant({
    model: { instance: model },
    maxMemoryItems: 60,
    onToolError: () => undefined,
    actor,
    siteUrl: 'https://norde.com.ar',
    searchProperties: new SearchProperties({ properties }),
    getPropertyDetail: new GetPropertyDetail({ properties }),
    registerContact: new RegisterContact({ uow: clients, ids, clock }),
  });
  const handler = new WebChatTurnHandler({
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
          web_chat: {
            perContactPerHour: 30,
            perContactPerDay: 120,
            outboundPerDay: 2000,
            ...options.limits,
          },
        },
      },
    }),
    sendReply: new SendReply({ uow: conversations, ids, clock, messengers }),
    assistant,
    actor,
    breaker: new FailureBreaker(options.breakerThreshold ?? 5, 10 * 60_000),
    now: () => clock.now(),
    logger: pino({ level: 'silent' }),
  });

  let sequence = 0;
  const message = (text: string, messageId?: string) => ({
    sessionId: SESSION,
    messageId: messageId ?? `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, '0')}`,
    text,
  });
  const conversation = () => [...conversations.conversations.rows.values()][0];

  return { model, messenger, clients, conversations, handler, message, conversation };
}

describe('WebChatTurnHandler', () => {
  it('searches the stock and returns the reply keeping its markdown', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [
        functionCall(
          'search_properties',
          { ...NO_FILTERS, operation: 'rent', location: 'Palermo' },
          { callId: 'c1' },
        ),
      ],
      [assistantMessage('Encontré 1 opción:\n1. **[2 ambientes en Palermo](https://x)**')],
    );

    const result = await ctx.handler.handle(ctx.message('busco alquilar en palermo'));

    expect(result).toEqual({
      kind: 'reply',
      reply: {
        text: 'Encontré 1 opción:\n1. **[2 ambientes en Palermo](https://x)**',
        photoUrl: null,
        buttons: [],
      },
    });
    expect(ctx.conversation()).toMatchObject({
      channel: 'web_chat',
      externalId: SESSION,
      searchCriteria: { operation: 'rent', location: 'Palermo' },
    });
    expect(ctx.conversation()?.agentMemory.length).toBeGreaterThan(2);
    expect(ctx.messenger.sent).toEqual([
      {
        to: SESSION,
        message: {
          type: 'text',
          text: 'Encontré 1 opción:\n1. **[2 ambientes en Palermo](https://x)**',
        },
      },
    ]);
    expect(ctx.conversations.messages.outbound).toHaveLength(1);
  });

  it('returns the photo and the buttons together', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [
        functionCall('show_photo', { propertyId: palermo.id }, { callId: 'c1' }),
        functionCall('offer_buttons', { options: ['Ver más', 'Visitarla'] }, { callId: 'c2' }),
      ],
      [assistantMessage('Así es el living.')],
    );

    const result = await ctx.handler.handle(ctx.message('¿tenés fotos?'));

    expect(result).toEqual({
      kind: 'reply',
      reply: {
        text: 'Así es el living.',
        photoUrl: COVER_URL,
        buttons: [
          { id: 'opt_1', title: 'Ver más' },
          { id: 'opt_2', title: 'Visitarla' },
        ],
      },
    });
    expect(ctx.messenger.sent[0]?.message).toMatchObject({ type: 'buttons' });
  });

  it('registers the visitor with the email they gave', async () => {
    const ctx = setup();
    ctx.model.enqueue(
      [
        functionCall(
          'register_client',
          {
            type: 'rent',
            intent: 'visit',
            name: 'Ana',
            email: 'ana@example.com',
            phone: null,
            propertyId: palermo.id,
            notes: 'Quiere visitarla',
            noMatchingStock: false,
          },
          { callId: 'c1' },
        ),
      ],
      [assistantMessage('¡Listo, Ana! Un asesor te va a escribir.')],
    );

    await ctx.handler.handle(ctx.message('quiero visitarla, soy Ana, ana@example.com'));

    const [client] = [...ctx.clients.clients.rows.values()];
    expect(client).toMatchObject({ name: 'Ana' });
    expect(client?.channels).toMatchObject([{ channel: 'web_chat', externalId: SESSION }]);
    expect([...ctx.clients.opportunities.rows.values()][0]).toMatchObject({
      originChannel: 'web_chat',
      propertyId: palermo.id,
    });
    expect(ctx.conversation()?.clientId).toBe(client?.id);
  });

  it('returns a fallback when the agent fails, and unavailable once the breaker opens', async () => {
    const ctx = setup({ breakerThreshold: 2 });
    ctx.model.enqueue(modelError(new Error('503')), modelError(new Error('503')));

    const first = await ctx.handler.handle(ctx.message('hola'));
    const second = await ctx.handler.handle(ctx.message('¿hola?'));
    const third = await ctx.handler.handle(ctx.message('¿hay alguien?'));

    expect(first).toEqual({
      kind: 'reply',
      reply: { text: FALLBACK_TEXT, photoUrl: null, buttons: [] },
    });
    expect(second).toEqual({ kind: 'unavailable' });
    expect(third).toEqual({ kind: 'unavailable' });
    expect(ctx.conversation()?.agentMemory).toEqual([]);
  });

  it('does not answer acknowledgements nor a retried message', async () => {
    const ctx = setup();
    ctx.model.enqueue([assistantMessage('¡Hola! ¿Qué estás buscando?')]);
    const hello = ctx.message('hola');

    expect((await ctx.handler.handle(hello)).kind).toBe('reply');
    expect(await ctx.handler.handle(hello)).toEqual({ kind: 'reply', reply: null });
    expect(await ctx.handler.handle(ctx.message('gracias!'))).toEqual({
      kind: 'reply',
      reply: null,
    });
    expect(ctx.model.calls).toHaveLength(1);
  });

  it('answers busy when the session sends too many messages', async () => {
    const ctx = setup({ limits: { perContactPerHour: 1 } });
    ctx.model.enqueue([assistantMessage('¡Hola!')]);

    await ctx.handler.handle(ctx.message('hola'));
    const result = await ctx.handler.handle(ctx.message('busco depto'));

    expect(result).toEqual({ kind: 'busy' });
    expect(ctx.model.calls).toHaveLength(1);
  });

  it('answers unavailable when the daily cap of the channel is reached', async () => {
    const ctx = setup({ limits: { outboundPerDay: 1 } });
    ctx.model.enqueue([assistantMessage('¡Hola!')]);

    await ctx.handler.handle(ctx.message('hola'));
    const result = await ctx.handler.handle(ctx.message('busco depto'));

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('stays silent while a person handles the conversation', async () => {
    const ctx = setup();
    ctx.model.enqueue([assistantMessage('¡Hola!')]);
    await ctx.handler.handle(ctx.message('hola'));
    const row = ctx.conversation();
    if (row) ctx.conversations.conversations.rows.set(row.id, { ...row, status: 'handed_off' });

    const result = await ctx.handler.handle(ctx.message('¿sigue disponible?'));

    expect(result).toEqual({ kind: 'reply', reply: null });
    expect(ctx.model.calls).toHaveLength(1);
  });
});
