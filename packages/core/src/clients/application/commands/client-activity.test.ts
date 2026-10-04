import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { Opportunity } from '../../domain/opportunity';
import {
  AGENT_ID,
  aListing,
  InMemoryClientAgents,
  InMemoryClientListings,
  InMemoryClientsUnitOfWork,
  InMemoryPropertyProfiles,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  OTHER_PROPERTY_ID,
  PROPERTY_ID,
  seedClient,
  seedOpportunity,
  seedSavedSearch,
  stageFixtureId,
  StubClientRecordQuery,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';
import { RecordClientActivity } from '../handlers/on-client-activity-event';
import { GetFeaturedPropertyIds } from '../queries/get-featured-property-ids';
import { ListClientActivity } from '../queries/list-client-activity';
import { ListClientFeatured } from '../queries/list-client-featured';
import { ListClientOpportunities } from '../queries/list-client-opportunities';
import { ListClientSavedSearches } from '../queries/list-client-saved-searches';

import { AddClientNote } from './add-client-note';
import { FeatureProperties } from './feature-properties';
import { SetFeaturedAutoSend } from './set-featured-auto-send';
import { UnfeatureProperty } from './unfeature-property';

const clock = new FixedClock('2026-03-10T12:00:00Z');
const MISSING = '00000000-0000-7000-8000-0000000000ff';
const EVENT_ID = '00000000-0000-7000-8000-0000000000ee';
const SELLER = Actor.user(AGENT_ID, ['clients:read', 'clients:update']);
const AGENT_WITH_LISTINGS = Actor.user(AGENT_ID, [
  'clients:read',
  'clients:update',
  'properties:read',
]);
const LOCATION_ID = '00000000-0000-7000-8000-0000000000a1';
const JOBS = Actor.system('scheduler', ['clients:record-activity']);

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const client = await seedClient(uow);
  const listings = new InMemoryClientListings();
  const profiles = new InMemoryPropertyProfiles([
    {
      propertyId: PROPERTY_ID,
      propertyType: 'apartment',
      operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
      locationIds: [LOCATION_ID],
      rooms: 3,
    },
  ]);
  const ids = new SequentialIdGenerator();
  return {
    uow,
    client,
    listings,
    addNote: new AddClientNote({ uow, ids, clock }),
    feature: new FeatureProperties({ uow, listings, profiles, ids, clock }),
    unfeature: new UnfeatureProperty({ uow, clock }),
    autoSend: new SetFeaturedAutoSend({ uow, clock }),
  };
}

describe('AddClientNote', () => {
  it('adds the note to the activity and audits it against the client', async () => {
    const { uow, client, addNote } = await setup();

    const { noteId } = unwrap(
      await addNote.execute({ clientId: client.id, text: ' Vuelve a llamar el lunes ' }, SELLER),
    );

    expect(uow.activities.of(client.id)).toEqual([
      {
        id: noteId,
        clientId: client.id,
        opportunityId: undefined,
        actorId: AGENT_ID,
        body: { kind: 'note', text: 'Vuelve a llamar el lunes' },
        occurredAt: clock.now(),
      },
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client.note_added',
        entityId: client.id,
        clientIds: [client.id],
        changes: {
          note: { before: null, after: 'Vuelve a llamar el lunes' },
        },
      }),
    ]);
  });

  it('rejects an empty note, a missing client and one in the trash', async () => {
    const { uow, client, addNote } = await setup();
    const trashed = await seedClient(uow, { phones: ['+541147770099'], deleted: true });

    expect(unwrapErr(await addNote.execute({ clientId: client.id, text: '  ' }, SELLER)).type).toBe(
      'InvalidInput',
    );
    expect(unwrapErr(await addNote.execute({ clientId: MISSING, text: 'Hola' }, SELLER))).toEqual({
      type: 'ClientNotFound',
    });
    expect(
      unwrapErr(await addNote.execute({ clientId: trashed.id, text: 'Hola' }, SELLER)),
    ).toEqual({ type: 'ClientInTrash' });
    expect(uow.activities.rows.size).toBe(0);
  });

  it('needs to be able to edit the client', async () => {
    const { client, addNote } = await setup();
    const input = { clientId: client.id, text: 'Hola' };

    expect(unwrapErr(await addNote.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await addNote.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    unwrap(await addNote.execute(input, TEST_MANAGER));
  });
});

describe('FeatureProperties', () => {
  it('features the properties once and audits them', async () => {
    const { uow, client, feature } = await setup();

    const first = unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID, PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );
    const second = unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );

    expect(first).toEqual({ featured: 1 });
    expect(second).toEqual({ featured: 1 });
    expect(uow.featured.activeFor(client.id).sort()).toEqual([PROPERTY_ID, OTHER_PROPERTY_ID]);
    expect(uow.audit.entries.map((e) => [e.action, e.changes])).toEqual([
      ['client.listings_featured', { propertyIds: { before: null, after: [PROPERTY_ID] } }],
      ['client.listings_featured', { propertyIds: { before: null, after: [OTHER_PROPERTY_ID] } }],
    ]);
  });

  it('stores the match with the best saved search, ignoring the deleted ones', async () => {
    const { uow, client, feature } = await setup();
    seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005a1',
      clientId: client.id,
      fields: { minRooms: 4 },
    });
    seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005a2',
      clientId: client.id,
      fields: { minRooms: 2 },
      snapshot: { deletedAt: clock.now() },
    });

    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );

    const scores = Object.fromEntries(
      [...uow.featured.rows.values()].map((row) => [row.propertyId, row.matchScore]),
    );
    // Sin perfil (la otra propiedad no está en el cruce), no hay coincidencia.
    expect(scores).toEqual({ [PROPERTY_ID]: 50, [OTHER_PROPERTY_ID]: undefined });
  });

  it('has no match without saved searches', async () => {
    const { uow, client, feature } = await setup();
    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );
    expect([...uow.featured.rows.values()][0]?.matchScore).toBeUndefined();
  });

  it('ties them to the latest open opportunity and tells it with an event', async () => {
    const { uow, client, feature } = await setup();
    const opportunity = await seedOpportunity(uow, client);

    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );

    expect([...uow.featured.rows.values()][0]?.opportunityId).toBe(opportunity.id);
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'clients.opportunity_listings_featured',
        aggregateId: opportunity.id,
        payload: { opportunityId: opportunity.id, clientId: client.id, propertyIds: [PROPERTY_ID] },
      }),
    ]);
    expect(uow.audit.entries[0]?.changes).toEqual({
      propertyIds: { before: null, after: [PROPERTY_ID] },
      opportunityId: { before: null, after: opportunity.id },
    });
  });

  it('does not publish an event without an open opportunity', async () => {
    const { uow, client, feature } = await setup();
    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );
    expect([...uow.featured.rows.values()][0]?.opportunityId).toBeUndefined();
    expect(uow.events.published).toEqual([]);
  });

  it('does not audit when everything was already featured', async () => {
    const { uow, client, feature } = await setup();
    const input = { clientId: client.id, propertyIds: [PROPERTY_ID] };

    unwrap(await feature.execute(input, AGENT_WITH_LISTINGS));
    expect(unwrap(await feature.execute(input, AGENT_WITH_LISTINGS))).toEqual({ featured: 0 });
    expect(uow.audit.entries).toHaveLength(1);
  });

  it('rejects a property outside the portfolio or that the actor cannot see', async () => {
    const { uow, client, feature } = await setup();

    expect(
      unwrapErr(
        await feature.execute({ clientId: client.id, propertyIds: [MISSING] }, AGENT_WITH_LISTINGS),
      ),
    ).toEqual({ type: 'ListingNotFound' });
    expect(
      unwrapErr(await feature.execute({ clientId: client.id, propertyIds: [PROPERTY_ID] }, SELLER)),
    ).toEqual({ type: 'ListingNotFound' });
    expect(uow.featured.rows.size).toBe(0);
  });

  it('needs to be able to edit the client, which is not in the trash', async () => {
    const { uow, client, feature } = await setup();
    const trashed = await seedClient(uow, { phones: ['+541147770099'], deleted: true });
    const other = Actor.user(OTHER_AGENT_ID, [
      'clients:read',
      'clients:update',
      'properties:read',
    ]).withBranch(OTHER_BRANCH_ID);

    expect(
      unwrapErr(await feature.execute({ clientId: client.id, propertyIds: [PROPERTY_ID] }, other)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await feature.execute(
          { clientId: trashed.id, propertyIds: [PROPERTY_ID] },
          AGENT_WITH_LISTINGS,
        ),
      ),
    ).toEqual({ type: 'ClientInTrash' });
    expect(
      unwrapErr(
        await feature.execute(
          { clientId: MISSING, propertyIds: [PROPERTY_ID] },
          AGENT_WITH_LISTINGS,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(
      unwrapErr(
        await feature.execute({ clientId: client.id, propertyIds: [PROPERTY_ID] }, TEST_OUTSIDER),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('UnfeatureProperty', () => {
  it('removes a featured property and audits it; a second time does nothing', async () => {
    const { uow, client, feature, unfeature } = await setup();
    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );

    unwrap(await unfeature.execute({ clientId: client.id, propertyId: PROPERTY_ID }, SELLER));
    unwrap(await unfeature.execute({ clientId: client.id, propertyId: PROPERTY_ID }, SELLER));

    expect(uow.featured.activeFor(client.id)).toEqual([]);
    expect(uow.featured.rows.size).toBe(1);
    expect(uow.audit.entries.map((e) => [e.action, e.changes])).toEqual([
      ['client.listings_featured', { propertyIds: { before: null, after: [PROPERTY_ID] } }],
      ['client.listing_unfeatured', { propertyId: { before: PROPERTY_ID, after: null } }],
    ]);
  });

  it('needs to be able to edit the client', async () => {
    const { client, unfeature } = await setup();
    const input = { clientId: client.id, propertyId: PROPERTY_ID };

    expect(unwrapErr(await unfeature.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await unfeature.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await unfeature.execute({ ...input, clientId: MISSING }, SELLER))).toEqual({
      type: 'ClientNotFound',
    });
  });
});

describe('SetFeaturedAutoSend', () => {
  it('toggles the auto-send of a featured property and audits it once', async () => {
    const { uow, client, feature, autoSend } = await setup();
    unwrap(
      await feature.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID] },
        AGENT_WITH_LISTINGS,
      ),
    );
    const input = { clientId: client.id, propertyId: PROPERTY_ID, enabled: true };

    unwrap(await autoSend.execute(input, SELLER));
    unwrap(await autoSend.execute(input, SELLER));

    expect([...uow.featured.rows.values()][0]?.autoSendUpdates).toBe(true);
    expect(uow.audit.entries.map((e) => [e.action, e.changes]).slice(1)).toEqual([
      [
        'client.featured_auto_send_changed',
        {
          propertyId: { before: PROPERTY_ID, after: PROPERTY_ID },
          autoSendUpdates: { before: false, after: true },
        },
      ],
    ]);
  });

  it('rejects a property that is not featured', async () => {
    const { client, autoSend } = await setup();
    expect(
      unwrapErr(
        await autoSend.execute(
          { clientId: client.id, propertyId: PROPERTY_ID, enabled: true },
          SELLER,
        ),
      ),
    ).toEqual({ type: 'FeaturedListingNotFound' });
  });

  it('needs to be able to edit the client', async () => {
    const { client, autoSend } = await setup();
    const input = { clientId: client.id, propertyId: PROPERTY_ID, enabled: true };
    expect(unwrapErr(await autoSend.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await autoSend.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await autoSend.execute({ ...input, clientId: MISSING }, SELLER))).toEqual({
      type: 'ClientNotFound',
    });
  });
});

describe('RecordClientActivity', () => {
  async function withOpportunity() {
    const { uow, client } = await setup();
    const opportunityId = parseId<'Opportunity'>('00000000-0000-7000-8000-0000000000f1');
    if (opportunityId.isErr()) throw new Error('Invalid test id');
    await uow.opportunities.save(
      Opportunity.open({
        id: opportunityId.value,
        clientId: client.id,
        originChannel: 'whatsapp',
        type: 'rent',
        intent: 'info',
        stage: { id: stageFixtureId(0), category: 'new', isActive: true },
        agent: { agentId: undefined, branchId: undefined },
        statusChangeId: unwrap(
          parseId<'OpportunityStatusChange'>('00000000-0000-7000-8000-0000000000f2'),
        ),
        propertyId: PROPERTY_ID,
        note: 'Busca 2 ambientes en Palermo',
        now: clock.now(),
      }),
      'user-1',
    );
    return { uow, client, opportunityId: opportunityId.value };
  }

  it('records an inquiry once, even if the event is delivered again', async () => {
    const { uow, client, opportunityId } = await withOpportunity();
    const handler = new RecordClientActivity({ uow });
    const event = {
      id: EVENT_ID,
      type: 'clients.opportunity_created' as const,
      occurredAt: clock.now(),
      payload: { opportunityId, clientId: client.id },
    };

    expect(unwrap(await handler.execute(event, JOBS))).toEqual({ recorded: true });
    expect(unwrap(await handler.execute(event, JOBS))).toEqual({ recorded: false });

    const activities = uow.activities.of(client.id);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: EVENT_ID,
      opportunityId,
      actorId: 'system:agent-ia',
      body: {
        kind: 'inquiry',
        type: 'rent',
        followUp: false,
        note: 'Busca 2 ambientes en Palermo',
      },
    });
    expect(uow.audit.entries).toEqual([]);
  });

  it('records a follow-up and a conversation of the agent linked to the client', async () => {
    const { uow, client, opportunityId } = await withOpportunity();
    const handler = new RecordClientActivity({ uow });

    unwrap(
      await handler.execute(
        {
          id: EVENT_ID,
          type: 'clients.opportunity_request_added',
          occurredAt: clock.now(),
          payload: { opportunityId, clientId: client.id },
        },
        JOBS,
      ),
    );
    unwrap(
      await handler.execute(
        {
          id: '00000000-0000-7000-8000-0000000000ef',
          type: 'conversations.conversation_linked_to_client',
          occurredAt: clock.now(),
          payload: { conversationId: 'conv-1', clientId: client.id, channel: 'whatsapp' },
        },
        JOBS,
      ),
    );

    expect(uow.activities.of(client.id).map((a) => a.body)).toEqual([
      expect.objectContaining({ kind: 'inquiry', followUp: true }),
      { kind: 'message', conversationId: 'conv-1', channel: 'whatsapp' },
    ]);
  });

  it('reports a missing opportunity or client, an invalid event and a missing permission', async () => {
    const { uow } = await withOpportunity();
    const handler = new RecordClientActivity({ uow });
    const base = { id: EVENT_ID, occurredAt: clock.now() };

    expect(
      unwrapErr(
        await handler.execute(
          {
            ...base,
            type: 'clients.opportunity_created',
            payload: { opportunityId: MISSING, clientId: MISSING },
          },
          JOBS,
        ),
      ),
    ).toEqual({ type: 'OpportunityNotFound' });
    expect(
      unwrapErr(
        await handler.execute(
          {
            ...base,
            type: 'conversations.conversation_linked_to_client',
            payload: { conversationId: 'c', clientId: MISSING, channel: 'whatsapp' },
          },
          JOBS,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(
      unwrapErr(
        await handler.execute(
          {
            ...base,
            id: 'not-an-id',
            type: 'clients.opportunity_created',
            payload: { opportunityId: MISSING, clientId: MISSING },
          },
          JOBS,
        ),
      ),
    ).toEqual({ type: 'InvalidEvent' });
    expect(
      unwrapErr(
        await handler.execute(
          {
            ...base,
            type: 'clients.opportunity_created',
            payload: { opportunityId: MISSING, clientId: MISSING },
          },
          Actor.system('scheduler', ['clients:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('client detail tabs', () => {
  async function tabs() {
    const { uow, client } = await setup();
    const records = new StubClientRecordQuery();
    const agents = new InMemoryClientAgents();
    const listings = new InMemoryClientListings();
    return {
      uow,
      client,
      records,
      activity: new ListClientActivity({ uow, records, agents }),
      opportunities: new ListClientOpportunities({ uow, records, agents }),
      featured: new ListClientFeatured({ uow, records, listings, agents }),
      searches: new ListClientSavedSearches({ uow, records }),
      featuredIds: new GetFeaturedPropertyIds({ uow, records }),
    };
  }

  it('lists the activity with who did each thing, paginated in the query', async () => {
    const { client, records, activity } = await tabs();
    records.activityItems = [
      {
        id: 'a1',
        opportunityId: undefined,
        actorId: AGENT_ID,
        body: { kind: 'note', text: 'Hola' },
        occurredAt: clock.now(),
      },
      {
        id: 'a2',
        opportunityId: 'o1',
        actorId: 'system:agent-ia',
        body: { kind: 'message', conversationId: 'c1', channel: 'whatsapp' },
        occurredAt: clock.now(),
      },
      {
        id: 'a3',
        opportunityId: undefined,
        actorId: 'system:portal-sync',
        body: { kind: 'listing_viewed', propertyId: undefined },
        occurredAt: clock.now(),
      },
    ];

    const page = unwrap(
      await activity.execute(
        { clientId: client.id, kind: 'note', page: '2', pageSize: '10' },
        TEST_AGENT,
      ),
    );

    expect(records.activityCriteria).toEqual([
      { clientId: client.id, kind: 'note', direction: 'desc', offset: 10, limit: 10 },
    ]);
    expect(page.items.map((item) => item.actor)).toEqual([
      { kind: 'user', id: AGENT_ID, name: 'Camila' },
      { kind: 'agent' },
      { kind: 'system' },
    ]);
    expect(page.items[0]).toMatchObject({ id: 'a1', kind: 'note', text: 'Hola' });
  });

  it('lists the opportunities with their agent', async () => {
    const { client, records, opportunities } = await tabs();
    records.opportunityItems = [
      {
        id: 'o1',
        type: 'sale',
        intent: 'visit',
        status: 'contacted',
        stage: undefined,
        originChannel: 'whatsapp',
        propertyId: undefined,
        agentId: OTHER_AGENT_ID,
        createdAt: clock.now(),
        statusChangedAt: undefined,
        closedAt: undefined,
      },
    ];

    const page = unwrap(await opportunities.execute({ clientId: client.id }, TEST_AGENT));

    expect(page.items[0]).toMatchObject({
      open: true,
      agent: { id: OTHER_AGENT_ID, name: 'Martín' },
    });
    expect(records.opportunityCriteria[0]).toMatchObject({ direction: 'desc', offset: 0 });
  });

  it('lists the featured properties with their data; a deleted one stays without data', async () => {
    const OPPORTUNITY_OF_LISTING = '00000000-0000-7000-8000-0000000000e7';
    const { client, records, featured } = await tabs();
    records.featuredItems = [
      {
        id: 'f1',
        propertyId: PROPERTY_ID,
        opportunityId: OPPORTUNITY_OF_LISTING,
        matchScore: 80,
        autoSendUpdates: true,
        reaction: 'liked',
        featuredBy: AGENT_ID,
        featuredAt: clock.now(),
      },
      {
        id: 'f2',
        propertyId: MISSING,
        opportunityId: undefined,
        matchScore: undefined,
        autoSendUpdates: false,
        reaction: undefined,
        featuredBy: 'system:scheduler',
        featuredAt: clock.now(),
      },
    ];

    const page = unwrap(await featured.execute({ clientId: client.id }, AGENT_WITH_LISTINGS));

    expect(page.items).toEqual([
      expect.objectContaining({
        id: 'f1',
        opportunityId: OPPORTUNITY_OF_LISTING,
        property: aListing(),
        featuredBy: { id: AGENT_ID, name: 'Camila' },
      }),
      expect.objectContaining({ id: 'f2', property: undefined, featuredBy: undefined }),
    ]);
  });

  it('marks which properties of a page are already featured', async () => {
    const { client, records, featuredIds } = await tabs();
    records.featuredIds = [PROPERTY_ID];

    const ids = unwrap(
      await featuredIds.execute(
        { clientId: client.id, propertyIds: [PROPERTY_ID.toUpperCase(), OTHER_PROPERTY_ID] },
        TEST_AGENT,
      ),
    );

    expect([...ids]).toEqual([PROPERTY_ID]);
  });

  it('needs to be able to see the client', async () => {
    const { client, activity, opportunities, featured, searches, featuredIds } = await tabs();
    const input = { clientId: client.id };

    const errors = [
      unwrapErr(await activity.execute(input, TEST_OTHER_AGENT)),
      unwrapErr(await opportunities.execute(input, TEST_OTHER_AGENT)),
      unwrapErr(await featured.execute(input, TEST_OTHER_AGENT)),
      unwrapErr(await searches.execute(input, TEST_OTHER_AGENT)),
      unwrapErr(await featuredIds.execute({ ...input, propertyIds: [] }, TEST_OTHER_AGENT)),
      unwrapErr(await searches.execute(input, TEST_OUTSIDER)),
    ];
    expect(errors).toEqual(Array(6).fill({ type: 'Forbidden' }));
    expect(unwrapErr(await activity.execute({ clientId: MISSING }, TEST_AGENT))).toEqual({
      type: 'ClientNotFound',
    });
    expect(unwrapErr(await activity.execute({ clientId: 'x' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
  });
});
