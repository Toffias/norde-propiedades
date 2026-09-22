import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import type { InboundMessage, ReceiveInboundMessagesInput } from '../../contracts';
import { InMemoryConversationsUnitOfWork, RecordingMessenger } from '../../testing';
import type { ConversationPolicy } from '../conversation-policy';

import { ReceiveInboundMessages } from './receive-inbound-messages';
import { SendReply } from './send-reply';

const HOUR = 3_600_000;
const agent = Actor.system('agent-ia', ['conversations:*']);
const PHONE = '5491166899124';
const CLIENT_ID = '00000000-0000-7000-8000-0000000000c1';

const policy: ConversationPolicy = {
  idleResetAfterMs: 24 * HOUR,
  maxInboundAgeMs: 12 * HOUR,
  maxInboundTextChars: 20,
  usageLimits: {
    whatsapp: { perContactPerHour: 3, perContactPerDay: 10, outboundPerDay: 100 },
  },
};

function setup() {
  const uow = new InMemoryConversationsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const messenger = new RecordingMessenger();
  const messengers = { whatsapp: messenger };
  const receive = new ReceiveInboundMessages({ uow, ids, clock, messengers, policy });
  const reply = new SendReply({ uow, ids, clock, messengers });
  let sequence = 0;
  const message = (text: string, overrides: Partial<InboundMessage> = {}): InboundMessage => ({
    channelMessageId: `wamid.${++sequence}`,
    kind: 'text',
    text,
    sentAt: clock.now(),
    rawType: 'text',
    ...overrides,
  });
  const inbound = (
    messages: InboundMessage[],
    extra: Partial<ReceiveInboundMessagesInput> = {},
  ): ReceiveInboundMessagesInput => ({
    channel: 'whatsapp',
    externalId: PHONE,
    contactName: 'Ana',
    messages,
    ...extra,
  });
  return { uow, clock, messenger, receive, reply, message, inbound };
}

async function planFor(
  ctx: ReturnType<typeof setup>,
  messages: InboundMessage[],
  extra: Partial<ReceiveInboundMessagesInput> = {},
) {
  const result = await ctx.receive.execute(ctx.inbound(messages, extra), agent);
  if (result.isErr()) throw new Error(result.error.type);
  return result.value;
}

describe('ReceiveInboundMessages', () => {
  it('starts the conversation, records the messages and asks the agent to reply', async () => {
    const ctx = setup();

    const output = await planFor(ctx, [ctx.message('hola'), ctx.message('busco depto')]);

    expect(output.plan).toEqual({ action: 'agent', userText: 'hola\nbusco depto' });
    expect(output.contactName).toBe('Ana');
    expect(ctx.uow.conversations.rows.size).toBe(1);
    expect(ctx.uow.messages.inbound).toHaveLength(2);
    expect(ctx.messenger.read).toEqual(['wamid.2']);
    expect(ctx.uow.audit.entries.map((e) => e.action)).toEqual(['conversation.started']);
    expect(ctx.uow.events.published.map((e) => e.type)).toEqual([
      'conversations.conversation_started',
    ]);
  });

  it('ignores redeliveries', async () => {
    const ctx = setup();
    const hello = ctx.message('hola');
    await planFor(ctx, [hello]);

    const output = await planFor(ctx, [hello]);

    expect(output.plan).toEqual({ action: 'ignore' });
    expect(ctx.uow.messages.inbound).toHaveLength(1);
  });

  it('ignores stale messages but keeps them in the log', async () => {
    const ctx = setup();
    const old = ctx.message('hola', { sentAt: new Date(ctx.clock.now().getTime() - 13 * HOUR) });

    const output = await planFor(ctx, [old]);

    expect(output.plan).toEqual({ action: 'ignore' });
    expect(ctx.uow.messages.inbound).toHaveLength(1);
  });

  it('truncates long messages', async () => {
    const ctx = setup();

    const output = await planFor(ctx, [ctx.message('a'.repeat(50))]);

    expect(output.plan).toEqual({ action: 'agent', userText: 'a'.repeat(20) });
  });

  it('answers unsupported content with a notice', async () => {
    const ctx = setup();

    const output = await planFor(ctx, [ctx.message('', { kind: 'unsupported', rawType: 'audio' })]);

    expect(output.plan).toEqual({ action: 'notice', notice: 'unsupported_content' });
  });

  it('stays silent on acknowledgements', async () => {
    const ctx = setup();

    const output = await planFor(ctx, [ctx.message('gracias!')]);

    expect(output.plan).toEqual({ action: 'silent', reason: 'acknowledgement' });
  });

  it('stays silent while a person handles the conversation', async () => {
    const ctx = setup();
    const first = await planFor(ctx, [ctx.message('hola')]);
    const row = ctx.uow.conversations.rows.get(first.conversationId);
    if (row) ctx.uow.conversations.rows.set(first.conversationId, { ...row, status: 'handed_off' });

    const output = await planFor(ctx, [ctx.message('¿sigue disponible?')]);

    expect(output.plan).toEqual({ action: 'silent', reason: 'handed_off' });
  });

  it('notifies the contact when it exceeds its hourly limit', async () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) await planFor(ctx, [ctx.message(`consulta ${i}`)]);

    const output = await planFor(ctx, [ctx.message('otra consulta')]);

    expect(output.plan).toEqual({ action: 'notice', notice: 'contact_limit' });
  });

  it('stays silent when the channel reached its daily cap', async () => {
    const ctx = setup();
    const first = await planFor(ctx, [ctx.message('hola')]);
    for (let i = 0; i < 100; i++) {
      await ctx.reply.execute(
        { conversationId: first.conversationId, message: { type: 'text', text: 'hola' } },
        agent,
      );
    }

    const output = await planFor(ctx, [ctx.message('¿hay algo en Palermo?')]);

    expect(output.plan).toEqual({ action: 'silent', reason: 'channel_limit' });
  });

  it('resets the agent memory after the idle period', async () => {
    const ctx = setup();
    const first = await planFor(ctx, [ctx.message('hola')]);
    await ctx.reply.execute(
      {
        conversationId: first.conversationId,
        message: { type: 'text', text: '¡Hola!' },
        agentTurn: { memory: [{ role: 'user' }, { role: 'assistant' }] },
      },
      agent,
    );
    ctx.clock.advance(25 * HOUR);

    const output = await planFor(ctx, [ctx.message('hola de nuevo')]);

    expect(output.memoryReset).toBe(true);
    expect(output.agentMemory).toEqual([]);
  });

  it('rejects invalid input', async () => {
    const ctx = setup();

    const result = await ctx.receive.execute(ctx.inbound([]), agent);

    expect(result.isErr() && result.error.type).toBe('InvalidInput');
  });

  it('requires conversations:receive', async () => {
    const ctx = setup();

    const result = await ctx.receive.execute(
      ctx.inbound([ctx.message('hola')]),
      Actor.system('web', []),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(ctx.uow.messages.inbound).toEqual([]);
  });
});

describe('SendReply', () => {
  async function started(ctx: ReturnType<typeof setup>) {
    return (await planFor(ctx, [ctx.message('hola')])).conversationId;
  }

  it('sends through the channel, logs the message and saves the agent turn', async () => {
    const ctx = setup();
    const conversationId = await started(ctx);

    const result = await ctx.reply.execute(
      {
        conversationId,
        message: { type: 'text', text: '¡Hola! ¿Qué buscás?' },
        agentTurn: {
          memory: [{ role: 'user' }],
          searchCriteria: { location: 'Palermo' },
          usage: { requests: 1, inputTokens: 100, outputTokens: 20 },
        },
        clientId: CLIENT_ID,
      },
      agent,
    );

    expect(result.isOk() && result.value.channelMessageId).toBe('wamid.out-1');
    expect(ctx.messenger.sent).toEqual([
      { to: PHONE, message: { type: 'text', text: '¡Hola! ¿Qué buscás?' } },
    ]);
    expect(ctx.uow.messages.outbound[0]).toMatchObject({
      kind: 'text',
      body: { usage: { inputTokens: 100 }, sentBy: 'system:agent-ia' },
    });
    const row = ctx.uow.conversations.rows.get(conversationId);
    expect(row).toMatchObject({
      agentMemory: [{ role: 'user' }],
      searchCriteria: { location: 'Palermo' },
      clientId: CLIENT_ID,
    });
    expect(ctx.uow.audit.entries.at(-1)?.action).toBe('conversation.linked_to_client');
    expect(ctx.uow.events.published.at(-1)?.type).toBe(
      'conversations.conversation_linked_to_client',
    );
  });

  it('keeps the agent memory when the delivery fails, without logging a message', async () => {
    const ctx = setup();
    const conversationId = await started(ctx);
    ctx.messenger.failWith = { type: 'DeliveryFailed', reason: 'http 400' };

    const result = await ctx.reply.execute(
      { conversationId, message: { type: 'text', text: 'hola' }, agentTurn: { memory: [1] } },
      agent,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'DeliveryFailed', reason: 'http 400' });
    expect(ctx.uow.messages.outbound).toEqual([]);
    expect(ctx.uow.conversations.rows.get(conversationId)?.agentMemory).toEqual([1]);
  });

  it('fails for unknown conversations, invalid messages and channels without a messenger', async () => {
    const ctx = setup();
    const conversationId = await started(ctx);
    const text = { type: 'text', text: 'hola' } as const;

    const unknown = await ctx.reply.execute(
      { conversationId: '00000000-0000-7000-8000-999999999999', message: text },
      agent,
    );
    const invalid = await ctx.reply.execute(
      { conversationId, message: { type: 'text', text: '' } },
      agent,
    );
    const noChannel = await new SendReply({
      uow: ctx.uow,
      ids: new SequentialIdGenerator(),
      clock: ctx.clock,
      messengers: {},
    }).execute({ conversationId, message: text }, agent);

    expect(unknown.isErr() && unknown.error.type).toBe('ConversationNotFound');
    expect(invalid.isErr() && invalid.error.type).toBe('InvalidMessage');
    expect(noChannel.isErr() && noChannel.error.type).toBe('ChannelUnavailable');
  });

  it('requires conversations:reply', async () => {
    const ctx = setup();
    const conversationId = await started(ctx);

    const result = await ctx.reply.execute(
      { conversationId, message: { type: 'text', text: 'hola' } },
      Actor.system('web', []),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(ctx.messenger.sent).toEqual([]);
  });
});
