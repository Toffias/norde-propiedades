import {
  ReceiveInboundMessages,
  SendReply,
  type ConversationPolicy,
  type InboundMessage,
} from '@norde/core/conversations';
import { RecordingMessenger } from '@norde/core/conversations/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { conversationMessages, conversations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createConversationsUnitOfWork } from './conversations-unit-of-work';
import { DrizzleClientConversationErasure } from './drizzle-client-conversation-erasure';

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
  it('marks a tap on a button of an older message than the last reply', async () => {
    const { conversationId } = await receiveFrom([message('hola')]);
    const sent: string[] = [];
    for (const text of ['¿Comprar o alquilar?', '¿Querés visitarla?']) {
      const result = await reply.execute(
        { conversationId, message: { type: 'text', text } },
        agent,
      );
      if (result.isErr() || result.value.channelMessageId === undefined) throw new Error('send');
      sent.push(result.value.channelMessageId);
      clock.advance(1000);
    }
    const tap = (replyTo: string | undefined): InboundMessage => ({
      ...message('Sí'),
      kind: 'button',
      ...(replyTo === undefined ? {} : { replyTo }),
    });

    expect((await receiveFrom([tap(sent[0])])).plan).toEqual({
      action: 'agent',
      userText: '(botón de un mensaje anterior) Sí',
    });
    // El tope de la política es de 2 mensajes por hora.
    clock.advance(HOUR);
    expect((await receiveFrom([tap(sent[1])])).plan).toEqual({ action: 'agent', userText: 'Sí' });
  });

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
          shownProperties: [{ id: 'p1', title: '2 ambientes en Palermo' }],
          usage: { requests: 2, inputTokens: 900, outputTokens: 120 },
        },
      },
      agent,
    );
    const next = await receiveFrom([message('¿y con balcón?')]);

    expect(next.agentMemory).toEqual(memory);
    expect(next.searchCriteria).toEqual({ location: 'Palermo', maxPriceCents: 80_000_000n });
    expect(next.shownProperties).toEqual([{ id: 'p1', title: '2 ambientes en Palermo' }]);
    const outbound = await db.select().from(conversationMessages);
    expect(outbound.filter((m) => m.direction === 'out')).toMatchObject([
      { kind: 'text', channelMessageId: expect.any(String) as string },
    ]);
  });

  it('answers a "dale" only when the last reply asked something', async () => {
    const { conversationId } = await receiveFrom([message('hola')]);
    await reply.execute(
      { conversationId, message: { type: 'text', text: 'Te paso las opciones.' } },
      agent,
    );
    clock.advance(1000);
    await reply.execute(
      { conversationId, message: { type: 'text', text: '¿Querés que te llame un asesor?' } },
      agent,
    );

    const answer = await receiveFrom([message('dale')]);

    expect(answer.plan).toEqual({ action: 'agent', userText: 'dale' });
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

  it('erases the conversations of an erased client with their messages', async () => {
    const clientId = '00000000-0000-7000-8000-00000000c0de';
    const { conversationId } = await receiveFrom([message('Hola, busco un depto')]);
    await db.update(conversations).set({ clientId }).where(eq(conversations.id, conversationId));
    await receive.execute(
      {
        channel: 'whatsapp',
        externalId: '5491155550000',
        contactName: 'Otro',
        messages: [message('Hola')],
      },
      agent,
    );

    const erasure = new DrizzleClientConversationErasure(db);
    expect(await erasure.eraseForClients([clientId])).toBe(1);
    expect(await erasure.eraseForClients([clientId])).toBe(0);

    const left = await db.select().from(conversations);
    expect(left.map((c) => c.externalId)).toEqual(['5491155550000']);
    const messages = await db.select().from(conversationMessages);
    expect(messages.every((m) => m.conversationId === left[0]?.id)).toBe(true);
  });
});
