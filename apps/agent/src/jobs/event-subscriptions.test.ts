import type { RecordClientActivity, RouteInquiry, RunClientImport } from '@norde/core/clients';
import type { RunDevelopmentUnitImport } from '@norde/core/properties';
import { err, ok, Actor } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import {
  eventSubscriptions,
  type ErasureJobs,
  type MergeJobs,
  type OpportunityJobs,
  type PropertyJobs,
} from './event-subscriptions';

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

const CLIENT_ID = '00000000-0000-7000-8000-0000000000c1';
const IMPORT_ID = '00000000-0000-7000-8000-0000000000e1';
const DUPLICATE_ID = '00000000-0000-7000-8000-0000000000c2';
const importActor = Actor.system('import', ['clients:run-imports', 'properties:run-imports']);

/** La importación y la supresión, con lo que recibe cada una. */
function clientJobs(calls: unknown[] = []): {
  readonly erasure: ErasureJobs;
  readonly merge: MergeJobs;
  readonly runImport: Pick<RunClientImport, 'execute'>;
  readonly runUnitImport: Pick<RunDevelopmentUnitImport, 'execute'>;
  readonly opportunities: OpportunityJobs;
  readonly routeInquiry: Pick<RouteInquiry, 'execute'>;
  readonly importActor: Actor;
} {
  const erase = (name: string) => ({
    execute: (input: { readonly clientIds: readonly string[] }, by: Actor) => {
      calls.push([name, input, by.id]);
      return Promise.resolve(ok({ erased: 1, unlinked: 1, removed: 1 }));
    },
  });
  const move = (name: string) => ({
    execute: (input: { readonly clientId: string; readonly mergedClientId: string }, by: Actor) => {
      calls.push([name, input, by.id]);
      return Promise.resolve(ok({ moved: 1, propertyIds: [], developmentIds: [] }));
    },
  });
  return {
    erasure: {
      conversations: erase('conversations'),
      properties: erase('properties'),
      favorites: erase('favorites'),
    },
    merge: {
      conversations: move('merge-conversations'),
      properties: move('merge-properties'),
      favorites: move('merge-favorites'),
    },
    runImport: {
      execute: (input, by) => {
        calls.push(['import', input, by.id]);
        return Promise.resolve(ok({ status: 'done' as const }));
      },
    },
    runUnitImport: {
      execute: (input, by) => {
        calls.push(['unit-import', input, by.id]);
        return Promise.resolve(ok({ status: 'done' as const }));
      },
    },
    opportunities: {
      applyRules: {
        execute: (input, by) => {
          calls.push(['rules', input, by.id]);
          return Promise.resolve(ok({ applied: false as const, reason: 'no_rule' as const }));
        },
      },
      runBulk: {
        execute: (input, by) => {
          calls.push(['bulk', input, by.id]);
          return Promise.resolve(ok({ status: 'done' as const }));
        },
      },
    },
    routeInquiry: {
      execute: (input, by) => {
        calls.push(['route', input, by.id]);
        return Promise.resolve(ok({ routed: false as const, reason: 'no_rule' as const }));
      },
    },
    importActor,
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
      ...clientJobs(),
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
      'clients.client_erased.erase-conversations',
      'clients.client_erased.unlink-properties',
      'clients.client_erased.remove-favorites',
      'clients.clients_merged.move-conversations',
      'clients.clients_merged.move-properties',
      'clients.clients_merged.move-favorites',
      'clients.opportunity_reassigned.apply-rules',
      'clients.opportunity_request_added.apply-rules',
      'clients.opportunity_listings_featured.apply-rules',
      'clients.opportunity_created.apply-rules',
      'clients.opportunity_bulk_requested.run-bulk',
      'clients.import_requested.run-import',
      'properties.unit_import_requested.run-unit-import',
      'clients.inquiry_received.route-inquiry',
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
      ...clientJobs(),
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
      ...clientJobs(),
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
      ...clientJobs(),
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

  it('runs the import job as system:import and erases the client data in each module', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const byType = (type: string) => subscriptions.filter((s) => s.eventType === type);

    for (const subscription of byType('clients.import_requested')) {
      await subscription.handle({ ...event, payload: { importId: IMPORT_ID } });
    }
    for (const subscription of byType('properties.unit_import_requested')) {
      await subscription.handle({ ...event, payload: { importId: IMPORT_ID } });
    }
    for (const subscription of byType('clients.client_erased')) {
      await subscription.handle({
        ...event,
        payload: { clientId: CLIENT_ID, erasedClientIds: [CLIENT_ID] },
      });
    }

    for (const subscription of byType('clients.clients_merged')) {
      await subscription.handle({
        ...event,
        payload: { clientId: CLIENT_ID, mergedClientId: DUPLICATE_ID },
      });
    }

    expect(byType('clients.client_erased').map((s) => s.name)).toEqual([
      'erase-conversations',
      'unlink-properties',
      'remove-favorites',
    ]);
    expect(calls).toEqual([
      ['import', { importId: IMPORT_ID }, 'system:import'],
      ['unit-import', { importId: IMPORT_ID }, 'system:import'],
      ['conversations', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['properties', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['favorites', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ...['merge-conversations', 'merge-properties', 'merge-favorites'].map((name) => [
        name,
        { clientId: CLIENT_ID, mergedClientId: DUPLICATE_ID },
        'system:scheduler',
      ]),
    ]);
    await expect(
      byType('clients.clients_merged')[0]?.handle({ ...event, payload: { clientId: CLIENT_ID } }),
    ).rejects.toThrow();
    await expect(
      byType('clients.client_erased')[0]?.handle({ ...event, payload: { erasedClientIds: [] } }),
    ).rejects.toThrow();
  });

  it('routes a received inquiry as the scheduler and rejects a malformed payload', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const routing = subscriptions.find((s) => s.eventType === 'clients.inquiry_received');
    const INQUIRY_ID = '00000000-0000-7000-8000-0000000000f2';

    await routing?.handle({
      ...event,
      type: 'clients.inquiry_received',
      payload: { inquiryId: INQUIRY_ID, channel: 'zonaprop', propertyId: null },
    });

    expect(calls).toEqual([['route', { inquiryId: INQUIRY_ID }, 'system:scheduler']]);
    await expect(
      routing?.handle({ ...event, type: 'clients.inquiry_received', payload: { inquiryId: 'x' } }),
    ).rejects.toThrow();
  });

  it('leaves received inquiries pending without the routing, while the rules are paused', () => {
    const { routeInquiry: _routing, ...jobs } = clientJobs();
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...jobs,
      actor,
      logger: pino({ level: 'silent' }),
    });

    expect(subscriptions.some((s) => s.eventType === 'clients.inquiry_received')).toBe(false);
  });

  it('applies the automatic rules with the event id and runs the queued bulk actions', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const named = (type: string, name: string) =>
      subscriptions.find((s) => s.eventType === type && s.name === name);
    const OPERATION_ID = '00000000-0000-7000-8000-0000000000b1';

    await named('clients.opportunity_reassigned', 'apply-rules')?.handle({
      ...event,
      type: 'clients.opportunity_reassigned',
      payload: { opportunityId: 'opp-1', clientId: 'client-1', fromAgentId: 'a', toAgentId: null },
    });
    await named('clients.opportunity_listings_featured', 'apply-rules')?.handle({
      ...event,
      type: 'clients.opportunity_listings_featured',
      payload: { opportunityId: 'opp-1', clientId: 'client-1', propertyIds: ['p-1'] },
    });
    await named('clients.opportunity_created', 'apply-rules')?.handle(event);
    await named('clients.opportunity_bulk_requested', 'run-bulk')?.handle({
      ...event,
      payload: { operationId: OPERATION_ID },
    });

    expect(calls).toEqual([
      [
        'rules',
        {
          eventId: event.id,
          opportunityId: 'opp-1',
          trigger: { kind: 'assigned', toAgentId: undefined },
        },
        'system:scheduler',
      ],
      [
        'rules',
        { eventId: event.id, opportunityId: 'opp-1', trigger: { kind: 'listings_featured' } },
        'system:scheduler',
      ],
      [
        'rules',
        { eventId: event.id, opportunityId: 'opp-1', trigger: { kind: 'created' } },
        'system:scheduler',
      ],
      ['bulk', { operationId: OPERATION_ID }, 'system:scheduler'],
    ]);
  });
});
