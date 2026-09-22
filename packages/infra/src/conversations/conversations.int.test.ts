import {
  ReceiveInboundMessages,
  SendReply,
  type ConversationPolicy,
  type InboundMessage,
} from '@norde/core/conversations';
import { RecordingMessenger } from '@norde/core/conversations/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { conversationMessages, conversations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createConversationsUnitOfWork } from './conversations-unit-of-work';

const HOUR = 3_600_000;
const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createConversationsUnitOfWork(db, { ids, clock });
const messenger = new RecordingMessenger();
const policy: ConversationPolicy = {
  idleResetAfterMs: 24 * HOUR,
  maxInboundAgeMs: 12 * HOUR,
  maxInboundTextChars: 1000,
  usageLimits: { whatsapp: { perContactPerHour: 2, perContactPerDay: 10, outboundPerDay: 100 } },
};
const receive = new ReceiveInboundMessages({
  uow,
  ids,
  clock,
  messengers: { whatsapp: messenger },
  policy,
});
const reply = new SendReply({ uow, ids, clock, messengers: { whatsapp: messenger } });
const agent = Actor.system('agent-ia', ['conversations:*']);
let sequence = 0;

function message(text: string): InboundMessage {
  sequence += 1;
  return {
    channelMessageId: `wamid.int-${sequence}`,
    kind: 'text',
    text,
    sentAt: clock.now(),
    rawType: 'text',
  };
}

async function receiveFrom(messages: InboundMessage[]) {
  const result = await receive.execute(
    { channel: 'whatsapp', externalId: '5491166899124', contactName: 'Ana', messages },
    agent,
  );
  if (result.isErr()) throw new Error(result.error.type);
  return result.value;
}

describe('conversations persistence', () => {
  it('ignores redelivered messages thanks to the unique index', async () => {
    const hello = message('hola');

    const first = await receiveFrom([hello]);
    const again = await receiveFrom([hello]);

    expect(first.plan).toEqual({ action: 'agent', userText: 'hola' });
    expect(again.plan).toEqual({ action: 'ignore' });
    expect(await db.select().from(conversationMessages)).toHaveLength(1);
    expect(await db.select().from(conversations)).toHaveLength(1);
  });

  it('persists the agent memory and search criteria (with bigint) and the outbound log', async () => {
    const { conversationId } = await receiveFrom([message('busco depto en Palermo')]);
    const memory = [
      { role: 'user', content: 'busco depto en Palermo' },
      { type: 'function_call', name: 'search_properties', arguments: '{}', callId: 'c1' },
    ];

    await reply.execute(
      {
        conversationId,
        message: { type: 'text', text: 'Encontré 2 opciones' },
        agentTurn: {
          memory,
          searchCriteria: { location: 'Palermo', maxPriceCents: 80_000_000n },
          usage: { requests: 2, inputTokens: 900, outputTokens: 120 },
        },
      },
      agent,
    );
    const next = await receiveFrom([message('¿y con balcón?')]);

    expect(next.agentMemory).toEqual(memory);
    expect(next.searchCriteria).toEqual({ location: 'Palermo', maxPriceCents: 80_000_000n });
    const outbound = await db.select().from(conversationMessages);
    expect(outbound.filter((m) => m.direction === 'out')).toMatchObject([
      { kind: 'text', channelMessageId: expect.any(String) as string },
    ]);
  });

  it('counts messages for the usage limits', async () => {
    await receiveFrom([message('uno')]);
    await receiveFrom([message('dos')]);

    const third = await receiveFrom([message('tres')]);

    expect(third.plan).toEqual({ action: 'notice', notice: 'contact_limit' });
  });

  it('resets the memory after the idle period', async () => {
    const { conversationId } = await receiveFrom([message('hola')]);
    await reply.execute(
      {
        conversationId,
        message: { type: 'text', text: 'hola' },
        agentTurn: { memory: [{ role: 'user', content: 'hola' }] },
      },
      agent,
    );
    clock.advance(25 * HOUR);

    const later = await receiveFrom([message('hola otra vez')]);

    expect(later.memoryReset).toBe(true);
    expect(later.agentMemory).toEqual([]);
  });
});
