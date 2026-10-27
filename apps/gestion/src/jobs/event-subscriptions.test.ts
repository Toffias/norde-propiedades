import type { RecordClientActivity, RouteInquiry, RunClientImport } from '@norde/core/clients';
import type { RunTokkoUsersImport } from '@norde/core/identity';
import type { NotifyAssignment } from '@norde/core/notifications';
import type {
  RunDevelopmentUnitImport,
  RunPropertyImport,
  RunTokkoApiPropertyImport,
} from '@norde/core/properties';
import { err, ok, Actor } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import {
  eventSubscriptions,
  reconcilePortalListings,
  type AppraisalJobs,
  type ErasureJobs,
  type MergeJobs,
  type OpportunityJobs,
  type PropertyJobs,
  type SiteRevalidation,
} from './event-subscriptions';

const actor = Actor.system('scheduler', ['clients:read']);
const event = {
  id: '00000000-0000-7000-8000-000000000001',
  type: 'clients.opportunity_created',
  occurredAt: new Date('2026-03-01T10:00:00Z'),
  payload: { opportunityId: 'opp-1', clientId: 'client-1' },
};
const MEDIA_ID = '00000000-0000-7000-8000-0000000000f1';
const DEVELOPMENT_ID = '00000000-0000-7000-8000-0000000000e1';
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

const conversionActor = Actor.system('scheduler', [
  'properties:create',
  'properties:create-from-appraisal',
]);
const APPRAISAL_ID = '00000000-0000-7000-8000-0000000000a9';
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000b9';
const PHOTO_KEY = `appraisals/${APPRAISAL_ID}/photos/${MEDIA_ID}/original`;

function appraisalJobs(calls: unknown[] = []): AppraisalJobs {
  return {
    deletePhotoFiles: {
      execute: (input, by) => {
        calls.push(['delete-photos', input, by === actor]);
        return Promise.resolve(ok(undefined));
      },
    },
    createProperty: {
      execute: (input, by) => {
        calls.push(['create-property', input.listing.propertyId, by === conversionActor]);
        return Promise.resolve(ok('created' as const));
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
  readonly notifyAssignment: Pick<NotifyAssignment, 'execute'>;
  readonly runImport: Pick<RunClientImport, 'execute'>;
  readonly runUnitImport: Pick<RunDevelopmentUnitImport, 'execute'>;
  readonly runPropertyImport: Pick<RunPropertyImport, 'execute'>;
  readonly runTokkoApiPropertyImport: Pick<RunTokkoApiPropertyImport, 'execute'>;
  readonly runTokkoUsersImport: Pick<RunTokkoUsersImport, 'execute'>;
  readonly opportunities: OpportunityJobs;
  readonly routeInquiry: Pick<RouteInquiry, 'execute'>;
  readonly revalidateSite: SiteRevalidation;
  readonly importActor: Actor;
  readonly appraisals: AppraisalJobs;
  readonly conversionActor: Actor;
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
      appraisals: erase('appraisals'),
      notifications: erase('notifications'),
    },
    merge: {
      conversations: move('merge-conversations'),
      properties: move('merge-properties'),
      favorites: move('merge-favorites'),
      appraisals: move('merge-appraisals'),
      notifications: move('merge-notifications'),
    },
    notifyAssignment: {
      execute: (input, by) => {
        calls.push(['notify', input, by.id]);
        return Promise.resolve(ok({ notified: true }));
      },
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
    runPropertyImport: {
      execute: (input, by) => {
        calls.push(['property-import', input, by.id]);
        return Promise.resolve(ok({ status: 'done' as const }));
      },
    },
    runTokkoApiPropertyImport: {
      execute: (input, by) => {
        calls.push(['tokko-api-import', input, by.id]);
        return Promise.resolve(ok({ status: 'done' as const }));
      },
    },
    runTokkoUsersImport: {
      execute: (input, by) => {
        calls.push(['tokko-users-import', input, by.id]);
        return Promise.resolve(
          ok({ created: 10, suspended: 4, existing: 0, skipped: 0, unassigned: 2 }),
        );
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
    revalidateSite: {
      property: {
        execute: (input, by) => {
          calls.push(['revalidate', input, by.id]);
          return Promise.resolve(ok(undefined));
        },
      },
      development: {
        execute: (input, by) => {
          calls.push(['revalidate-development', input, by.id]);
          return Promise.resolve(ok(undefined));
        },
      },
    },
    importActor,
    appraisals: appraisalJobs(calls),
    conversionActor,
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
      'properties.property_changed.revalidate-site',
      'properties.media_changed.revalidate-site',
      'properties.media_deleted.revalidate-site',
      'properties.development_changed.revalidate-site',
      'appraisals.appraisal_photo_deleted.delete-photo-files',
      'appraisals.appraisal_converted.create-property',
      'clients.opportunity_created.record-activity',
      'clients.opportunity_request_added.record-activity',
      'conversations.conversation_linked_to_client.record-activity',
      'clients.client_erased.erase-conversations',
      'clients.client_erased.unlink-properties',
      'clients.client_erased.remove-favorites',
      'clients.client_erased.erase-appraisals',
      'clients.client_erased.remove-notifications',
      'clients.clients_merged.move-conversations',
      'clients.clients_merged.move-properties',
      'clients.clients_merged.move-favorites',
      'clients.clients_merged.move-appraisals',
      'clients.clients_merged.move-notifications',
      'clients.opportunity_reassigned.apply-rules',
      'clients.opportunity_request_added.apply-rules',
      'clients.opportunity_listings_featured.apply-rules',
      'clients.opportunity_created.apply-rules',
      'clients.opportunity_bulk_requested.run-bulk',
      'clients.client_reassigned.notify-assignee',
      'clients.opportunity_reassigned.notify-assignee',
      'clients.inquiry_assigned.notify-assignee',
      'clients.import_requested.run-import',
      'properties.unit_import_requested.run-unit-import',
      'properties.import_requested.run-property-import',
      'identity.tokko_users_import_requested.run-tokko-users-import',
      'properties.tokko_api_import_requested.run-tokko-api-property-import',
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

  it('revalidates the public site when a property, a development or a gallery changes', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const site = subscriptions.filter((s) => s.name === 'revalidate-site');
    const owner = { ownerKind: 'property', ownerId: PROPERTY_ID, mediaId: MEDIA_ID };

    await site[0]?.handle({ ...event, payload: { propertyId: PROPERTY_ID, code: 'DEP0001' } });
    await site[1]?.handle({ ...event, payload: owner });
    await site[2]?.handle({ ...event, payload: { ...owner, storageKeys: ['a'] } });
    const development = { ownerKind: 'development', ownerId: DEVELOPMENT_ID, mediaId: MEDIA_ID };
    await site[1]?.handle({ ...event, payload: development });
    await site[3]?.handle({ ...event, payload: { developmentId: DEVELOPMENT_ID, code: 'EMP1' } });

    const revalidated = ['revalidate', { propertyId: PROPERTY_ID }, 'system:scheduler'];
    const revalidatedDevelopment = [
      'revalidate-development',
      { developmentId: DEVELOPMENT_ID },
      'system:scheduler',
    ];
    expect(calls).toEqual([
      revalidated,
      revalidated,
      revalidated,
      revalidatedDevelopment,
      revalidatedDevelopment,
    ]);
    await expect(site[0]?.handle({ ...event, payload: { propertyId: 'x' } })).rejects.toThrow();
  });

  it('deletes removed appraisal photos and creates the property of a converted one', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(),
      appraisals: appraisalJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const byType = (type: string) => subscriptions.find((s) => s.eventType === type);
    const base = { appraisalId: APPRAISAL_ID, requesterClientId: CLIENT_ID };

    await byType('appraisals.appraisal_photo_deleted')?.handle({
      ...event,
      payload: { ...base, storageKeys: [PHOTO_KEY] },
    });
    await byType('appraisals.appraisal_converted')?.handle({
      ...event,
      payload: {
        ...base,
        listing: {
          propertyId: PROPERTY_ID,
          appraisalCode: 'TAS0001',
          propertyType: 'house',
          producerUserId: CLIENT_ID,
          sale: { priceCents: '12000000', currency: 'USD' },
          photoKeys: [PHOTO_KEY],
        },
      },
    });
    expect(calls).toEqual([
      ['delete-photos', { storageKeys: [PHOTO_KEY] }, true],
      ['create-property', PROPERTY_ID, true],
    ]);
    await expect(
      byType('appraisals.appraisal_converted')?.handle({ ...event, payload: base }),
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
    for (const subscription of byType('properties.import_requested')) {
      await subscription.handle({ ...event, payload: { importId: IMPORT_ID } });
    }
    // Bajar las fotos de toda la cartera lleva más que los 15 minutos de pg-boss.
    const [tokkoUsers] = byType('identity.tokko_users_import_requested');
    expect(tokkoUsers?.expireInSeconds).toBeGreaterThan(15 * 60);
    await tokkoUsers?.handle({ ...event, payload: { requestId: IMPORT_ID } });
    const [tokkoApi] = byType('properties.tokko_api_import_requested');
    expect(tokkoApi?.expireInSeconds).toBeGreaterThan(60 * 60);
    await tokkoApi?.handle({ ...event, payload: { importId: IMPORT_ID } });
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
      'erase-appraisals',
      'remove-notifications',
    ]);
    expect(calls).toEqual([
      ['import', { importId: IMPORT_ID }, 'system:import'],
      ['unit-import', { importId: IMPORT_ID }, 'system:import'],
      ['property-import', { importId: IMPORT_ID }, 'system:import'],
      ['tokko-users-import', { importId: IMPORT_ID }, 'system:import'],
      ['tokko-api-import', { importId: IMPORT_ID }, 'system:import'],
      ['conversations', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['properties', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['favorites', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['appraisals', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ['notifications', { clientIds: [CLIENT_ID] }, 'system:scheduler'],
      ...[
        'merge-conversations',
        'merge-properties',
        'merge-favorites',
        'merge-appraisals',
        'merge-notifications',
      ].map((name) => [
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

  it('notifies the assignee of a contact, an opportunity or an inquiry', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(calls),
      actor,
      logger: pino({ level: 'silent' }),
    });
    const notify = (type: string) =>
      subscriptions.find((s) => s.eventType === type && s.name === 'notify-assignee');
    const OPPORTUNITY_ID = '00000000-0000-7000-8000-0000000000d2';
    const INQUIRY_ID = '00000000-0000-7000-8000-0000000000f3';
    const MANAGER_ID = '00000000-0000-7000-8000-0000000000a3';
    const AGENT_ID = '00000000-0000-7000-8000-0000000000a4';

    await notify('clients.client_reassigned')?.handle({
      ...event,
      payload: {
        clientId: CLIENT_ID,
        fromAgentId: null,
        toAgentId: AGENT_ID,
        assignedBy: MANAGER_ID,
        inquiryId: INQUIRY_ID,
      },
    });
    // Los eventos de antes de las notificaciones no traen quién asignó.
    await notify('clients.opportunity_reassigned')?.handle({
      ...event,
      payload: { opportunityId: OPPORTUNITY_ID, clientId: CLIENT_ID, toAgentId: AGENT_ID },
    });
    await notify('clients.inquiry_assigned')?.handle({
      ...event,
      payload: {
        inquiryId: INQUIRY_ID,
        clientId: CLIENT_ID,
        opportunityId: OPPORTUNITY_ID,
        agentId: AGENT_ID,
        assignedBy: MANAGER_ID,
      },
    });

    const base = { sourceEventId: event.id, clientId: CLIENT_ID, occurredAt: event.occurredAt };
    expect(calls).toEqual([
      [
        'notify',
        {
          ...base,
          type: 'client.assigned',
          entityId: CLIENT_ID,
          fromAgentId: undefined,
          toAgentId: AGENT_ID,
          assignedBy: MANAGER_ID,
          inquiryId: INQUIRY_ID,
        },
        'system:scheduler',
      ],
      [
        'notify',
        {
          ...base,
          type: 'opportunity.assigned',
          entityId: OPPORTUNITY_ID,
          fromAgentId: undefined,
          toAgentId: AGENT_ID,
          assignedBy: undefined,
          inquiryId: undefined,
        },
        'system:scheduler',
      ],
      [
        'notify',
        {
          ...base,
          type: 'inquiry.assigned',
          entityId: INQUIRY_ID,
          toAgentId: AGENT_ID,
          assignedBy: MANAGER_ID,
        },
        'system:scheduler',
      ],
    ]);
    await expect(
      notify('clients.opportunity_reassigned')?.handle({ ...event, payload: { clientId: 'x' } }),
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

describe('portal subscriptions', () => {
  const portalActor = Actor.system('portal-sync', ['portals:sync']);
  const LISTING_ID = '00000000-0000-7000-8000-0000000000a1';

  function portalSetup(
    outcome: 'synced' | 'retry' = 'synced',
    reconciled: 'changed' | 'unavailable' = 'changed',
    unitDevelopmentId?: string,
  ) {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(ok(undefined)) },
      recordActivity: recordActivity(),
      properties: propertyJobs(),
      ...clientJobs(),
      portals: {
        requestSync: {
          execute: (input, by) => {
            calls.push(['request-sync', input, by.id]);
            return Promise.resolve(ok({ requested: 1 }));
          },
        },
        requestAll: {
          execute: (input, by) => {
            calls.push(['request-all', input, by.id]);
            return Promise.resolve(ok({ requested: 3 }));
          },
        },
        propertySummaries: {
          execute: (input) => {
            calls.push(['summaries', input]);
            return Promise.resolve(
              ok(unitDevelopmentId === undefined ? [] : [{ developmentId: unitDevelopmentId }]),
            );
          },
        },
        sync: {
          execute: (input, by) => {
            calls.push(['sync', input, by.id]);
            return Promise.resolve(ok(outcome));
          },
        },
        pullLeads: {
          execute: (input, by) => {
            calls.push(['pull-leads', input, by.id]);
            return Promise.resolve(
              ok({ received: 1, duplicates: 0, skipped: 0, rejected: 0, rejections: [] }),
            );
          },
        },
        reconcile: {
          execute: (input, by) => {
            calls.push(['reconcile', input, by.id]);
            return Promise.resolve(
              input.portal === 'mercadolibre'
                ? ok({ checked: 3, changed: 1, retried: 0 })
                : err({ type: 'PortalUnavailable' as const }),
            );
          },
        },
        reconcileOne: {
          execute: (input, by) => {
            calls.push(['reconcile-one', input, by.id]);
            return Promise.resolve(
              reconciled === 'changed' ? ok(true) : err({ type: 'PortalUnavailable' as const }),
            );
          },
        },
        actor: portalActor,
      },
      actor,
      logger: pino({ level: 'silent' }),
    });
    const find = (queue: string) => {
      const found = subscriptions.find((s) => `${s.eventType}.${s.name}` === queue);
      if (!found) throw new Error(`No subscription ${queue}`);
      return found;
    };
    return { subscriptions, calls, find };
  }

  it('only subscribes with the portals jobs', () => {
    const { subscriptions } = portalSetup();
    expect(subscriptions.map((s) => `${s.eventType}.${s.name}`)).toEqual(
      expect.arrayContaining([
        'properties.property_changed.sync-portal-listings',
        'properties.media_changed.sync-portal-listings',
        'properties.media_deleted.sync-portal-listings',
        'properties.development_changed.sync-portal-listings',
        'portals.listing_sync_requested.sync-listing',
        'portals.listing_changed_on_portal.reconcile-listing',
      ]),
    );
  });

  it('asks to sync the listings when a property or its photos change', async () => {
    const { find, calls } = portalSetup();
    await find('properties.property_changed.sync-portal-listings').handle({
      ...event,
      type: 'properties.property_changed',
      payload: { propertyId: PROPERTY_ID, code: 'DEP0001' },
    });
    await find('properties.media_changed.sync-portal-listings').handle({
      ...event,
      type: 'properties.media_changed',
      payload: { ownerKind: 'property', ownerId: PROPERTY_ID, mediaId: MEDIA_ID },
    });
    expect(calls).toEqual([
      ['request-sync', { propertyId: PROPERTY_ID }, 'system:portal-sync'],
      ['request-sync', { propertyId: PROPERTY_ID }, 'system:portal-sync'],
      ['summaries', { ids: [PROPERTY_ID] }],
    ]);
  });

  it('resends the development listing when the photos of one of its units change', async () => {
    const developmentId = '00000000-0000-7000-8000-0000000000d1';
    const { find, calls } = portalSetup('synced', 'changed', developmentId);
    await find('properties.media_deleted.sync-portal-listings').handle({
      ...event,
      type: 'properties.media_deleted',
      payload: { ownerKind: 'property', ownerId: PROPERTY_ID, mediaId: MEDIA_ID, storageKeys: [] },
    });
    expect(calls).toEqual([
      ['request-sync', { propertyId: PROPERTY_ID }, 'system:portal-sync'],
      ['summaries', { ids: [PROPERTY_ID] }],
      ['request-sync', { developmentId }, 'system:portal-sync'],
    ]);
  });

  it('asks to sync the development listings when it, its photos or its units change', async () => {
    const { find, calls } = portalSetup();
    const developmentId = '00000000-0000-7000-8000-0000000000d1';
    await find('properties.development_changed.sync-portal-listings').handle({
      ...event,
      type: 'properties.development_changed',
      payload: { developmentId, code: 'EMP0001' },
    });
    await find('properties.media_changed.sync-portal-listings').handle({
      ...event,
      type: 'properties.media_changed',
      payload: { ownerKind: 'development', ownerId: developmentId, mediaId: MEDIA_ID },
    });
    await find('properties.property_changed.sync-portal-listings').handle({
      ...event,
      type: 'properties.property_changed',
      payload: { propertyId: PROPERTY_ID, code: 'DEP0001', developmentIds: [developmentId] },
    });
    expect(calls).toEqual([
      ['request-sync', { developmentId }, 'system:portal-sync'],
      ['request-sync', { developmentId }, 'system:portal-sync'],
      ['request-sync', { propertyId: PROPERTY_ID }, 'system:portal-sync'],
      ['request-sync', { developmentId }, 'system:portal-sync'],
    ]);
  });

  it('syncs a listing and throws when the portal did not answer, so the queue retries', async () => {
    const synced = portalSetup('synced');
    const delivered = {
      ...event,
      type: 'portals.listing_sync_requested',
      payload: { listingId: LISTING_ID, propertyId: PROPERTY_ID },
    };
    await synced.find('portals.listing_sync_requested.sync-listing').handle(delivered);
    expect(synced.calls).toEqual([['sync', { listingId: LISTING_ID }, 'system:portal-sync']]);

    const retry = portalSetup('retry');
    await expect(
      retry.find('portals.listing_sync_requested.sync-listing').handle(delivered),
    ).rejects.toThrow('Portal unavailable');
  });

  it('reconciles a listing the portal changed, and throws when the portal did not answer', async () => {
    const delivered = {
      ...event,
      type: 'portals.listing_changed_on_portal',
      payload: { listingId: LISTING_ID },
    };
    const changed = portalSetup();
    await changed.find('portals.listing_changed_on_portal.reconcile-listing').handle(delivered);
    expect(changed.calls).toEqual([
      ['reconcile-one', { listingId: LISTING_ID }, 'system:portal-sync'],
    ]);

    const unavailable = portalSetup('synced', 'unavailable');
    await expect(
      unavailable.find('portals.listing_changed_on_portal.reconcile-listing').handle(delivered),
    ).rejects.toThrow('Portal unavailable');
  });

  it('pulls the portal leads when the portal notifies a contact', async () => {
    const { find, calls } = portalSetup();
    await find('portals.leads_arrived.pull-portal-leads').handle({
      ...event,
      type: 'portals.leads_arrived',
      payload: { portal: 'zonaprop' },
    });
    expect(calls).toEqual([['pull-leads', { portal: 'zonaprop' }, 'system:portal-sync']]);
  });

  it('syncs every listing when the branch contact or the listed settings change', async () => {
    const { find, calls } = portalSetup();
    await find('identity.branch_updated.sync-portal-listings').handle({
      ...event,
      type: 'identity.branch_updated',
      payload: { branchId: LISTING_ID },
    });
    const settings = find('settings.company_settings_changed.sync-portal-listings');
    for (const section of ['portals', 'general', 'pdf']) {
      await settings.handle({
        ...event,
        type: 'settings.company_settings_changed',
        payload: { section },
      });
    }
    expect(calls).toEqual([
      ['request-all', {}, 'system:portal-sync'],
      ['request-all', {}, 'system:portal-sync'],
      ['request-all', {}, 'system:portal-sync'],
    ]);
  });

  it('gathers a burst of portal notices into one read per minute', () => {
    const { find } = portalSetup();
    expect(find('portals.leads_arrived.pull-portal-leads').throttleSeconds).toBe(60);
  });
});

describe('reconcilePortalListings', () => {
  it('reconciles each portal account as system:portal-sync, and goes on when one fails', async () => {
    const calls: unknown[] = [];
    const unused = () => Promise.reject(new Error('not used'));
    await reconcilePortalListings(
      {
        requestSync: { execute: unused },
        requestAll: { execute: unused },
        sync: { execute: unused },
        propertySummaries: { execute: unused },
        pullLeads: { execute: unused },
        reconcileOne: { execute: unused },
        reconcile: {
          execute: (input, by) => {
            calls.push([input.portal, by.id]);
            return Promise.resolve(
              input.portal === 'mercadolibre'
                ? err({ type: 'PortalUnavailable' as const })
                : ok({ checked: 0, changed: 0, retried: 0 }),
            );
          },
        },
        actor: Actor.system('portal-sync', ['portals:sync']),
      },
      pino({ level: 'silent' }),
    );
    expect(calls).toEqual([
      ['mercadolibre', 'system:portal-sync'],
      ['mercadolibre_developments', 'system:portal-sync'],
      ['zonaprop', 'system:portal-sync'],
    ]);
  });
});
