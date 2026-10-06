import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { PortalAccount } from '../domain/portal-account';
import {
  FakeListingSourceReader,
  FakePortalConnector,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
  listingSource,
} from '../testing';
import { ChangeListingType } from './commands/change-listing-type';
import { PauseListing } from './commands/pause-listing';
import { RequestListingSync } from './commands/request-listing-sync';
import { RequestPublication } from './commands/request-publication';
import { ResumeListing } from './commands/resume-listing';
import { ResyncListing } from './commands/resync-listing';
import { SyncListing } from './commands/sync-listing';
import { UnpublishListing } from './commands/unpublish-listing';
import { GetPropertyListings } from './queries/get-property-listings';

const AGENT = Actor.user('agent-1', ['portals:publish']);
const VIEWER = Actor.user('agent-2', ['properties:read']);
const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const NOW = '2026-10-06T12:00:00.000Z';
const SALE = { propertyId: LISTED_PROPERTY_ID, operation: 'sale' } as const;

function connectedAccount(enabled = true) {
  const account = PortalAccount.notConnected('mercadolibre');
  unwrap(
    account.connect(
      {
        externalAccountId: '123',
        accountName: 'NORDE',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
      [],
    ),
  );
  if (enabled) unwrap(account.enable());
  return account.toSnapshot();
}

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  uow.accounts.rows.set('mercadolibre', connectedAccount());
  const reader = new FakeListingSourceReader();
  reader.sources.set(LISTED_PROPERTY_ID, listingSource());
  const connector = new FakePortalConnector();
  const clock = new FixedClock(NOW);
  const deps = { uow, reader, connector, clock };
  return {
    ...deps,
    request: new RequestPublication({ ...deps, ids: new SequentialIdGenerator() }),
    sync: new SyncListing(deps),
    syncProperty: new RequestListingSync({ uow, clock }),
    pause: new PauseListing({ uow, clock }),
    resume: new ResumeListing({ uow, clock }),
    unpublish: new UnpublishListing({ uow, clock }),
    changeType: new ChangeListingType({ uow, clock }),
    resync: new ResyncListing({ uow, clock }),
    list: new GetPropertyListings({ uow }),
  };
}

/** Pide publicar la venta y corre el job: queda creada en el portal. */
async function published() {
  const s = setup();
  const { listingId } = unwrap(await s.request.execute(SALE, AGENT));
  unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC));
  s.connector.calls.length = 0;
  return { ...s, listingId };
}

describe('RequestPublication', () => {
  it('creates a pending listing, asks for the job and audits it on the property', async () => {
    const { request, uow } = setup();

    const { listingId } = unwrap(
      await request.execute({ ...SALE, listingType: 'featured' }, AGENT),
    );

    expect(uow.listings.rows.get(listingId)).toMatchObject({
      portal: 'mercadolibre',
      propertyId: LISTED_PROPERTY_ID,
      operation: 'sale',
      listingType: 'featured',
      status: 'pending',
      intent: 'active',
    });
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.listing_sync_requested',
        payload: { listingId, propertyId: LISTED_PROPERTY_ID },
      }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.portal_publish_requested',
        entityType: 'property',
        entityId: LISTED_PROPERTY_ID,
        changes: {
          [`listings.${listingId}`]: {
            before: null,
            after: {
              listingId,
              portal: 'mercadolibre',
              operation: 'sale',
              listingType: 'featured',
              externalId: null,
            },
          },
        },
      }),
    ]);
  });

  it('rejects a second listing of the same operation', async () => {
    const { request } = await published();
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({ type: 'ListingAlreadyExists' });
  });

  it('republishes an operation that was unpublished', async () => {
    const { request, unpublish, sync, uow, listingId } = await published();
    unwrap(await unpublish.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    const again = unwrap(await request.execute(SALE, AGENT));

    expect(again.listingId).toBe(listingId);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      status: 'pending',
      intent: 'active',
      externalId: undefined,
    });
  });

  it('requires a connected and enabled account', async () => {
    const { request, uow } = setup();
    uow.accounts.rows.set('mercadolibre', connectedAccount(false));
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({
      type: 'PortalNotEnabled',
      portal: 'mercadolibre',
    });
    expect(uow.listings.rows.size).toBe(0);
  });

  it('does not publish properties through the developments account', async () => {
    const { request } = setup();
    expect(
      unwrapErr(await request.execute({ ...SALE, portal: 'mercadolibre_developments' }, AGENT)),
    ).toEqual({ type: 'PortalNotForProperties' });
  });

  it('fails for an unknown property', async () => {
    const { request, reader } = setup();
    reader.sources.clear();
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({ type: 'PropertyNotFound' });
  });

  it('leaves the units to their development', async () => {
    const { request, reader } = setup();
    reader.sources.set(
      LISTED_PROPERTY_ID,
      listingSource({ developmentId: '01920000-0000-7000-8000-0000000000c1' }),
    );
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({
      type: 'UnitPublishedWithDevelopment',
    });
  });

  it('only publishes an available property', async () => {
    const { request, reader } = setup();
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ availability: 'paused' }));
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({ type: 'PropertyNotAvailable' });
  });

  it('only publishes an operation the property offers', async () => {
    const { request } = setup();
    expect(
      unwrapErr(await request.execute({ ...SALE, operation: 'temporary_rent' }, AGENT)),
    ).toEqual({ type: 'OperationNotOffered' });
  });

  it('requires a price', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute({ ...SALE, operation: 'rent' }, AGENT))).toEqual({
      type: 'PriceRequired',
    });
  });

  it('lists what the portal is missing', async () => {
    const { request, connector } = setup();
    connector.problemsFound = ['Falta la superficie cubierta.'];
    expect(unwrapErr(await request.execute(SALE, AGENT))).toEqual({
      type: 'MissingListingData',
      problems: ['Falta la superficie cubierta.'],
    });
  });

  it('requires portals:publish', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute(SALE, VIEWER))).toEqual({ type: 'Forbidden' });
  });
});

describe('SyncListing', () => {
  it('creates the listing in the portal and audits it as published', async () => {
    const s = setup();
    const { listingId } = unwrap(await s.request.execute(SALE, AGENT));

    expect(unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    expect(s.connector.calls.map((c) => c.method)).toEqual(['create']);
    expect(s.uow.listings.rows.get(listingId)).toMatchObject({
      status: 'published',
      externalId: 'MLA1',
      permalink: 'https://ml.test/MLA1',
      publishedAt: new Date(NOW),
    });
    expect(s.uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.portal_published',
      actorId: 'system:portal-sync',
      entityId: LISTED_PROPERTY_ID,
      changes: {
        [`listings.${listingId}.status`]: { before: 'pending', after: 'published' },
        [`listings.${listingId}.externalId`]: { before: null, after: 'MLA1' },
      },
    });
  });

  it('does not call the portal when nothing changed', async () => {
    const { sync, connector, listingId, uow } = await published();
    const audits = uow.audit.entries.length;
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');
    expect(connector.calls).toEqual([]);
    expect(uow.audit.entries).toHaveLength(audits);
  });

  it('sends the new content when the property changed, without a new audit entry', async () => {
    const { sync, connector, reader, listingId, uow } = await published();
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ title: 'Nuevo título' }));
    const audits = uow.audit.entries.length;

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    expect(connector.calls).toMatchObject([
      { method: 'update', externalId: 'MLA1', state: 'active', content: { operation: 'sale' } },
    ]);
    expect(uow.audit.entries).toHaveLength(audits);
  });

  it('ignores a new signed URL for the same photo', async () => {
    const { sync, connector, reader, listingId } = await published();
    const photos = [
      { id: 'photo-1', version: '2026-10-01T00:00:00.000Z', url: 'https://signed/other' },
    ];
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ photos }));
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');
    expect(connector.calls).toEqual([]);
  });

  it('pauses the listing while the property is reserved and reactivates it later', async () => {
    const { sync, connector, reader, listingId, uow } = await published();
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ availability: 'paused' }));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    expect(uow.listings.rows.get(listingId)?.status).toBe('paused');
    expect(uow.audit.entries.at(-1)?.action).toBe('property.portal_paused');

    reader.sources.set(LISTED_PROPERTY_ID, listingSource());
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls.map((c) => [c.method, c.state])).toEqual([
      ['update', 'paused'],
      ['update', 'active'],
    ]);
    expect(uow.listings.rows.get(listingId)?.status).toBe('published');
  });

  it('closes the listing for good when the property is sold', async () => {
    const { sync, connector, reader, listingId, uow } = await published();
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ availability: 'closed' }));

    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls).toEqual([{ method: 'close', externalId: 'MLA1' }]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      status: 'unpublished',
      intent: 'closed',
    });
    expect(uow.audit.entries.at(-1)?.action).toBe('property.portal_unpublished');
  });

  it('closes the listing when the property was deleted', async () => {
    const { sync, connector, reader, listingId } = await published();
    reader.sources.clear();
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    expect(connector.calls.map((c) => c.method)).toEqual(['close']);
  });

  it('records that the portal closed the listing on its own', async () => {
    const { sync, connector, reader, listingId, uow } = await published();
    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ title: 'Otro' }));
    connector.remoteState = 'closed';
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    expect(uow.listings.rows.get(listingId)?.status).toBe('unpublished');
  });

  it('keeps the reason when the portal rejects the listing', async () => {
    const s = setup();
    const { listingId } = unwrap(await s.request.execute(SALE, AGENT));
    s.connector.failWith = { type: 'PortalRejected', reason: 'El título tiene datos de contacto.' };

    expect(unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC))).toBe('failed');

    expect(s.uow.listings.rows.get(listingId)).toMatchObject({
      status: 'error',
      lastError: 'El título tiene datos de contacto.',
      retryCount: 1,
    });
    expect(s.uow.events.published.at(-1)?.type).toBe('portals.listing_sync_failed');
    expect(s.uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.portal_sync_failed',
      changes: {
        [`listings.${listingId}.lastError`]: {
          before: null,
          after: 'El título tiene datos de contacto.',
        },
      },
    });
  });

  it('asks the job to retry when the portal does not answer', async () => {
    const s = setup();
    const { listingId } = unwrap(await s.request.execute(SALE, AGENT));
    s.connector.failWith = { type: 'PortalUnavailable' };
    expect(unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC))).toBe('retry');
    expect(s.uow.listings.rows.get(listingId)?.status).toBe('error');
  });

  it('asks to reconnect the account when the portal revoked it', async () => {
    const s = setup();
    const { listingId } = unwrap(await s.request.execute(SALE, AGENT));
    s.connector.failWith = { type: 'PortalCredentialsMissing' };
    unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC));
    expect(s.uow.listings.rows.get(listingId)?.lastError).toContain('volver a conectar');
  });

  it('does not call the portal when the account was disabled', async () => {
    const s = setup();
    const { listingId } = unwrap(await s.request.execute(SALE, AGENT));
    s.uow.accounts.rows.set('mercadolibre', connectedAccount(false));
    expect(unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC))).toBe('failed');
    expect(s.connector.calls).toEqual([]);
  });

  it('does not send a listing that lost its price', async () => {
    const { sync, connector, reader, listingId, uow } = await published();
    reader.sources.set(
      LISTED_PROPERTY_ID,
      listingSource({
        operations: [
          { operation: 'sale', currency: 'USD', priceCents: undefined, priceOnRequest: true },
        ],
      }),
    );
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('failed');
    expect(connector.calls).toEqual([]);
    expect(uow.listings.rows.get(listingId)?.lastError).toContain('precio');
  });

  it('requires portals:sync', async () => {
    const { sync, listingId } = await published();
    expect(unwrapErr(await sync.execute({ listingId }, AGENT))).toEqual({ type: 'Forbidden' });
  });

  it('fails for an unknown listing', async () => {
    const { sync } = setup();
    expect(
      unwrapErr(
        await sync.execute({ listingId: '01920000-0000-7000-8000-00000000ffff' }, PORTAL_SYNC),
      ),
    ).toEqual({ type: 'ListingNotFound' });
  });
});

describe('team actions on a listing', () => {
  it('pauses and resumes, auditing the request', async () => {
    const { pause, resume, sync, connector, listingId, uow } = await published();

    unwrap(await pause.execute({ listingId }, AGENT));
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.portal_pause_requested',
      changes: { [`listings.${listingId}.intent`]: { before: 'active', after: 'paused' } },
    });
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    unwrap(await resume.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls.map((c) => c.state)).toEqual(['paused', 'active']);
  });

  it('does not audit a pause that changes nothing', async () => {
    const { pause, listingId, uow } = await published();
    unwrap(await pause.execute({ listingId }, AGENT));
    const audits = uow.audit.entries.length;
    unwrap(await pause.execute({ listingId }, AGENT));
    expect(uow.audit.entries).toHaveLength(audits);
  });

  it('unpublishes and then cannot pause', async () => {
    const { unpublish, pause, listingId, uow } = await published();
    unwrap(await unpublish.execute({ listingId }, AGENT));
    expect(uow.audit.entries.at(-1)?.action).toBe('property.portal_unpublish_requested');
    expect(unwrapErr(await pause.execute({ listingId }, AGENT))).toEqual({ type: 'ListingClosed' });
  });

  it('changes the type and sends it again', async () => {
    const { changeType, sync, connector, listingId, uow } = await published();
    unwrap(await changeType.execute({ listingId, listingType: 'featured' }, AGENT));
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.portal_type_changed',
      changes: { [`listings.${listingId}.listingType`]: { before: 'simple', after: 'featured' } },
    });
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    expect(connector.calls[0]?.content?.listingType).toBe('featured');
  });

  it('asks for a sync without changing data', async () => {
    const { resync, listingId, uow } = await published();
    const audits = uow.audit.entries.length;
    unwrap(await resync.execute({ listingId }, AGENT));
    expect(uow.events.published.at(-1)?.type).toBe('portals.listing_sync_requested');
    expect(uow.audit.entries).toHaveLength(audits);
  });

  it('fails for an unknown listing', async () => {
    const { pause } = setup();
    expect(
      unwrapErr(await pause.execute({ listingId: '01920000-0000-7000-8000-00000000ffff' }, AGENT)),
    ).toEqual({ type: 'ListingNotFound' });
  });

  it('requires portals:publish', async () => {
    const { pause, resume, unpublish, changeType, resync, listingId } = await published();
    for (const result of [
      await pause.execute({ listingId }, VIEWER),
      await resume.execute({ listingId }, VIEWER),
      await unpublish.execute({ listingId }, VIEWER),
      await changeType.execute({ listingId, listingType: 'featured' }, VIEWER),
      await resync.execute({ listingId }, VIEWER),
    ]) {
      expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
    }
  });
});

describe('RequestListingSync', () => {
  it('skips the listings already closed in the portal', async () => {
    const { syncProperty, sync, unpublish, uow, listingId } = await published();
    unwrap(await unpublish.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    const before = uow.events.published.length;

    const { requested } = unwrap(
      await syncProperty.execute({ propertyId: LISTED_PROPERTY_ID }, PORTAL_SYNC),
    );

    expect(requested).toBe(0);
    expect(uow.events.published).toHaveLength(before);
  });

  it('requests one sync per published listing', async () => {
    const { syncProperty, uow } = await published();
    const before = uow.events.published.length;
    expect(
      unwrap(await syncProperty.execute({ propertyId: LISTED_PROPERTY_ID }, PORTAL_SYNC)).requested,
    ).toBe(1);
    expect(uow.events.published.slice(before).map((e) => e.type)).toEqual([
      'portals.listing_sync_requested',
    ]);
  });

  it('requires portals:sync', async () => {
    const { syncProperty } = setup();
    expect(
      unwrapErr(await syncProperty.execute({ propertyId: LISTED_PROPERTY_ID }, AGENT)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('GetPropertyListings', () => {
  it('shows the listings and the enabled property portals', async () => {
    const { list, listingId } = await published();
    const view = unwrap(await list.execute({ propertyId: LISTED_PROPERTY_ID }, AGENT));
    expect(view).toMatchObject({
      canPublish: true,
      portals: ['mercadolibre'],
      listings: [{ id: listingId, status: 'published', permalink: 'https://ml.test/MLA1' }],
    });
  });

  it('offers no portal while the account is disabled', async () => {
    const { list, uow } = setup();
    uow.accounts.rows.set('mercadolibre', connectedAccount(false));
    expect(unwrap(await list.execute({ propertyId: LISTED_PROPERTY_ID }, AGENT)).portals).toEqual(
      [],
    );
  });

  it('lets account managers see it without publishing', async () => {
    const { list } = setup();
    const manager = Actor.user('admin-2', ['portals:manage']);
    expect(unwrap(await list.execute({ propertyId: LISTED_PROPERTY_ID }, manager)).canPublish).toBe(
      false,
    );
  });

  it('requires a portals permission', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({ propertyId: LISTED_PROPERTY_ID }, VIEWER))).toEqual({
      type: 'Forbidden',
    });
  });
});
