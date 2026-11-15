import { describe, expect, it } from 'vitest';

import { seedClient, InMemoryClientsUnitOfWork } from '../testing';

import { contactDataIsVerified, unverifiedContactNeedsReview } from './contact-verification';

const SESSION = 'web-session-1';

describe('contactDataIsVerified', () => {
  it('trusts the channels that give the contact data, not the site chat', () => {
    expect(contactDataIsVerified('whatsapp')).toBe(true);
    expect(contactDataIsVerified('zonaprop')).toBe(true);
    expect(contactDataIsVerified('web_chat')).toBe(false);
  });
});

describe('unverifiedContactNeedsReview', () => {
  it('sends to review a site chat that points to a client of another conversation', async () => {
    const client = await seedClient(new InMemoryClientsUnitOfWork());

    expect(
      unverifiedContactNeedsReview({
        channel: 'web_chat',
        channelExternalId: SESSION,
        existing: client,
        clientsInConversation: 0,
      }),
    ).toBe(true);
  });

  it('lets the conversation keep working with the client it registered', async () => {
    const client = await seedClient(new InMemoryClientsUnitOfWork());
    client.recordContact('web_chat', SESSION, new Date('2026-11-14T12:00:00Z'));

    expect(
      unverifiedContactNeedsReview({
        channel: 'web_chat',
        channelExternalId: SESSION,
        existing: client,
        clientsInConversation: 1,
      }),
    ).toBe(false);
  });

  it('lets a conversation register one new client, not more', () => {
    const input = { channel: 'web_chat' as const, channelExternalId: SESSION, existing: undefined };

    expect(unverifiedContactNeedsReview({ ...input, clientsInConversation: 0 })).toBe(false);
    expect(unverifiedContactNeedsReview({ ...input, clientsInConversation: 1 })).toBe(true);
  });

  it('never applies to verified channels', async () => {
    const client = await seedClient(new InMemoryClientsUnitOfWork());

    expect(
      unverifiedContactNeedsReview({
        channel: 'whatsapp',
        channelExternalId: '5491166899124',
        existing: client,
        clientsInConversation: 3,
      }),
    ).toBe(false);
  });
});
