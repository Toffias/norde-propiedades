import { describe, expect, it } from 'vitest';

import { Conversation, type ConversationId } from './conversation';
import { evaluateUsage, isAcknowledgementOnly, isStale } from './reply-policy';

const T0 = new Date('2026-03-01T10:00:00Z');
const HOUR = 3_600_000;
const ID = '00000000-0000-7000-8000-000000000001' as ConversationId;
const CLIENT_ID = '00000000-0000-7000-8000-0000000000c1';

function started(): Conversation {
  const conversation = Conversation.start({
    id: ID,
    channel: 'whatsapp',
    externalId: '5491166899124',
    contactName: ' Ana ',
    now: T0,
  });
  conversation.pullEvents();
  return conversation;
}

describe('Conversation', () => {
  it('starts active, empty and emits ConversationStarted', () => {
    const conversation = Conversation.start({
      id: ID,
      channel: 'whatsapp',
      externalId: '5491166899124',
      now: T0,
    });

    expect(conversation.status).toBe('active');
    expect(conversation.canBotReply()).toBe(true);
    expect(conversation.agentMemory).toEqual([]);
    expect(conversation.pullEvents().map((e) => e.type)).toEqual([
      'conversations.conversation_started',
    ]);
  });

  it('keeps the memory while the contact is active', () => {
    const conversation = started();
    conversation.recordAgentTurn({ memory: [{ role: 'user' }], searchCriteria: { zona: 'x' } });

    const { memoryReset } = conversation.registerInbound({
      now: new Date(T0.getTime() + 2 * HOUR),
      idleResetAfterMs: 24 * HOUR,
    });

    expect(memoryReset).toBe(false);
    expect(conversation.agentMemory).toHaveLength(1);
  });

  it('forgets the memory and returns to the bot after the idle period', () => {
    const conversation = started();
    conversation.recordAgentTurn({ memory: [{ role: 'user' }], searchCriteria: { zona: 'x' } });
    conversation.handOff(T0);

    const { memoryReset } = conversation.registerInbound({
      now: new Date(T0.getTime() + 25 * HOUR),
      idleResetAfterMs: 24 * HOUR,
      contactName: 'Ana María',
    });

    expect(memoryReset).toBe(true);
    expect(conversation.agentMemory).toEqual([]);
    expect(conversation.searchCriteria).toBeUndefined();
    expect(conversation.status).toBe('active');
    expect(conversation.contactName).toBe('Ana María');
  });

  it('does not report a reset when there was nothing to forget', () => {
    const conversation = started();

    const { memoryReset } = conversation.registerInbound({
      now: new Date(T0.getTime() + 48 * HOUR),
      idleResetAfterMs: 24 * HOUR,
    });

    expect(memoryReset).toBe(false);
  });

  it('keeps the previous search criteria when a turn does not bring new ones', () => {
    const conversation = started();
    conversation.recordAgentTurn({ memory: [], searchCriteria: { zona: 'Palermo' } });

    conversation.recordAgentTurn({ memory: [1, 2] });

    expect(conversation.searchCriteria).toEqual({ zona: 'Palermo' });
  });

  it('links the client once', () => {
    const conversation = started();

    conversation.linkClient(CLIENT_ID, T0);
    conversation.linkClient(CLIENT_ID, T0);

    expect(conversation.clientId).toBe(CLIENT_ID);
    expect(conversation.pullEvents().map((e) => e.type)).toEqual([
      'conversations.conversation_linked_to_client',
    ]);
  });

  it('silences the bot while handed off and gives it back', () => {
    const conversation = started();

    expect(conversation.handOff(T0).isOk()).toBe(true);
    expect(conversation.canBotReply()).toBe(false);
    expect(conversation.handOff(T0).isErr()).toBe(true);
    expect(conversation.returnToBot(T0).isOk()).toBe(true);
    expect(conversation.canBotReply()).toBe(true);
    expect(conversation.returnToBot(T0).isErr()).toBe(true);
  });
});

describe('reply policy', () => {
  it.each(['ok', 'Gracias!', 'muchas gracias.', '👍', 'dale '])(
    '"%s" is only an acknowledgement',
    (text) => {
      expect(isAcknowledgementOnly(text)).toBe(true);
    },
  );

  it.each(['ok, y tienen algo en Belgrano?', 'hola', 'gracias, quiero visitarlo'])(
    '"%s" deserves a reply',
    (text) => {
      expect(isAcknowledgementOnly(text)).toBe(false);
    },
  );

  it('detects stale messages', () => {
    expect(isStale(T0, new Date(T0.getTime() + 13 * HOUR), 12 * HOUR)).toBe(true);
    expect(isStale(T0, new Date(T0.getTime() + HOUR), 12 * HOUR)).toBe(false);
  });

  it('evaluates usage limits, the channel cap first', () => {
    const limits = { perContactPerHour: 30, perContactPerDay: 120, outboundPerDay: 3000 };
    const normal = { contactLastHour: 5, contactLastDay: 10, outboundLastDay: 100 };

    expect(evaluateUsage(normal, limits)).toEqual({ allowed: true });
    expect(evaluateUsage({ ...normal, contactLastHour: 31 }, limits)).toEqual({
      allowed: false,
      reason: 'contact_hour',
    });
    expect(evaluateUsage({ ...normal, contactLastDay: 121 }, limits)).toEqual({
      allowed: false,
      reason: 'contact_day',
    });
    expect(
      evaluateUsage({ contactLastHour: 99, contactLastDay: 999, outboundLastDay: 3000 }, limits),
    ).toEqual({
      allowed: false,
      reason: 'channel_day',
    });
  });
});
