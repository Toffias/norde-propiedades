import type { RecordClientActivity } from '@norde/core/clients';
import { err, ok, Actor } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { eventSubscriptions, type PropertyJobs } from './event-subscriptions';

const actor = Actor.system('scheduler', ['clients:read']);
const event = {
  id: '00000000-0000-7000-8000-000000000001',
  type: 'clients.opportunity_created',
  occurredAt: new Date('2026-03-01T10:00:00Z'),
  payload: { opportunityId: 'opp-1', clientId: 'client-1' },
};
const MEDIA_ID = '00000000-0000-7000-8000-0000000000f1';
const DOCUMENT_ID = '00000000-0000-7000-8000-0000000000d1';

function propertyJobs(calls: unknown[] = []): PropertyJobs {
  return {
    generateMediaVariants: {
      execute: (input) => {
        calls.push(['variants', input]);
        return Promise.resolve(ok('ready' as const));
      },
    },
    deleteStoredMediaFiles: {
      execute: (input) => {
        calls.push(['delete', input]);
        return Promise.resolve(err({ type: 'Forbidden' as const }));
      },
    },
    renderDocument: {
      execute: (input) => {
        calls.push(['render', input]);
        return Promise.resolve(ok('ready' as const));
      },
    },
  };
}

function recordActivity(calls: unknown[] = []): Pick<RecordClientActivity, 'execute'> {
  return {
    execute: (input) => {
      calls.push(input);
      return Promise.resolve(ok({ recorded: true }));
    },
  };
}

describe('eventSubscriptions', () => {
  it('notifies the team for new opportunities and follow-ups', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: {
        execute: (input) => {
          calls.push(input);
          return Promise.resolve(ok(undefined));
        },
      },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      actor,
      logger: pino({ level: 'silent' }),
    });

    expect(subscriptions.map((s) => `${s.eventType}.${s.name}`)).toEqual([
      'clients.opportunity_created.notify-team',
      'clients.opportunity_request_added.notify-team',
      'properties.media_variants_requested.generate-variants',
      'properties.media_deleted.delete-files',
      'properties.document_requested.render-document',
      'clients.opportunity_created.record-activity',
      'clients.opportunity_request_added.record-activity',
      'conversations.conversation_linked_to_client.record-activity',
    ]);
    await subscriptions[1]?.handle({ ...event, type: 'clients.opportunity_request_added' });
    expect(calls).toEqual([
      {
        type: 'clients.opportunity_request_added',
        occurredAt: event.occurredAt,
        payload: { opportunityId: 'opp-1', clientId: 'client-1' },
      },
    ]);
  });

  it('does not retry expected errors, and rejects malformed payloads', async () => {
    const [subscription] = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(err({ type: 'OpportunityNotFound' as const })) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      actor,
      logger: pino({ level: 'silent' }),
    });

    await expect(subscription?.handle(event)).resolves.toBeUndefined();
    await expect(subscription?.handle({ ...event, payload: { nope: true } })).rejects.toThrow();
  });

  it('runs the property jobs with the payload of each event', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const byType = (type: string) => subscriptions.find((s) => s.eventType === type);

    await byType('properties.media_variants_requested')?.handle({
      ...event,
      payload: { propertyId: 'p', mediaId: MEDIA_ID },
    });
    // Un error esperado (`Err`) se registra y no se reintenta.
    await expect(
      byType('properties.media_deleted')?.handle({
        ...event,
        payload: { propertyId: 'p', mediaId: MEDIA_ID, storageKeys: ['a'] },
      }),
    ).resolves.toBeUndefined();
    await byType('properties.document_requested')?.handle({
      ...event,
      payload: { propertyId: 'p', documentId: DOCUMENT_ID, kind: 'sheet' },
    });
    expect(calls).toEqual([
      ['variants', { mediaId: MEDIA_ID }],
      ['delete', { storageKeys: ['a'] }],
      ['render', { documentId: DOCUMENT_ID }],
    ]);
    await expect(
      byType('properties.document_requested')?.handle({ ...event, payload: { documentId: 'x' } }),
    ).rejects.toThrow();
  });

  it('records the inquiries and the conversations of the agent in the client activity', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(calls),
      properties: propertyJobs(),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const activity = subscriptions.filter((s) => s.name === 'record-activity');

    await activity[0]?.handle(event);
    await activity[2]?.handle({
      ...event,
      type: 'conversations.conversation_linked_to_client',
      payload: { conversationId: 'conv-1', clientId: 'client-1' },
    });

    expect(calls).toEqual([
      { ...event, type: 'clients.opportunity_created' },
      {
        ...event,
        type: 'conversations.conversation_linked_to_client',
        payload: { conversationId: 'conv-1', clientId: 'client-1', channel: 'unknown' },
      },
    ]);
  });
});
