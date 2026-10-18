import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { Listing } from '../domain/listing';
import type { PortalId } from '../domain/portal';
import { PortalAccount } from '../domain/portal-account';
import {
  FakePortalListingStateReader,
  FakePortalListingStatsReader,
  FakePortalPackageReader,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
} from '../testing';
import { NotifyListingChanged } from './commands/notify-listing-changed';
import { ReconcileListing } from './commands/reconcile-listing';
import { ReconcileListings } from './commands/reconcile-listings';
import { GetListingStats } from './queries/get-listing-stats';
import { GetPortalPackages } from './queries/get-portal-packages';

const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const ADMIN = Actor.user('admin-1', ['portals:manage']);
const AGENT = Actor.user('agent-1', ['portals:publish']);
const VIEWER = Actor.user('agent-2', ['properties:read']);
const NOW = '2026-10-17T06:00:00.000Z';
const EXPIRED = { state: 'closed', reason: 'MercadoLibre venció el aviso.' } as const;

function connect(uow: InMemoryPortalsUnitOfWork, portal: PortalId = 'mercadolibre') {
  const account = PortalAccount.notConnected(portal);
  unwrap(
    account.connect(
      {
        externalAccountId: '3773207548',
        accountName: 'NORDE',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
      [],
    ),
  );
  uow.accounts.rows.set(portal, account.toSnapshot());
}

/** Una publicación ya creada en el portal como `MLA<n>`. */
function seedPublished(
  uow: InMemoryPortalsUnitOfWork,
  n: number,
  portal: PortalId = 'mercadolibre',
) {
  const id = unwrap(
    parseId<'Listing'>(`01920000-0000-7000-8000-${n.toString().padStart(12, '0')}`),
  );
  const listing = Listing.request({
    id,
    portal,
    owner: { kind: 'property', id: LISTED_PROPERTY_ID },
    operation: n % 2 === 0 ? 'sale' : 'rent',
    listingType: 'simple',
    plan: undefined,
    now: new Date(NOW),
  });
  listing.recordCreated({
    externalId: `MLA${n.toString()}`,
    permalink: undefined,
    contentHash: 'hash',
    now: new Date(NOW),
  });
  listing.pullEvents();
  uow.listings.rows.set(id, listing.toSnapshot());
  return id;
}

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  connect(uow);
  const reader = new FakePortalListingStateReader();
  const reconcile = new ReconcileListings({ uow, reader, clock: new FixedClock(NOW) });
  return { uow, reader, reconcile };
}

describe('ReconcileListings', () => {
  it('closes the listings the portal expired and audits it with the reason', async () => {
    const { uow, reader, reconcile } = setup();
    const expired = seedPublished(uow, 1);
    seedPublished(uow, 2);
    reader.remote.set('MLA1', EXPIRED);
    reader.remote.set('MLA2', { state: 'active', reason: undefined });

    const outcome = unwrap(await reconcile.execute({ portal: 'mercadolibre' }, PORTAL_SYNC));

    expect(outcome).toEqual({ checked: 2, changed: 1 });
    expect(uow.listings.rows.get(expired)).toMatchObject({
      status: 'unpublished',
      intent: 'closed',
      lastError: 'MercadoLibre venció el aviso.',
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.portal_unpublished',
        entityId: LISTED_PROPERTY_ID,
        changes: {
          [`listings.${expired}.status`]: { before: 'published', after: 'unpublished' },
          [`listings.${expired}.lastError`]: {
            before: null,
            after: 'MercadoLibre venció el aviso.',
          },
        },
      }),
    ]);
  });

  it('pauses the listings the portal moderated', async () => {
    const { uow, reader, reconcile } = setup();
    const id = seedPublished(uow, 1);
    reader.remote.set('MLA1', { state: 'paused', reason: 'MercadoLibre pausó el aviso.' });

    unwrap(await reconcile.execute({ portal: 'mercadolibre' }, PORTAL_SYNC));

    expect(uow.listings.rows.get(id)).toMatchObject({
      status: 'paused',
      intent: 'active',
      lastError: 'MercadoLibre pausó el aviso.',
    });
    expect(uow.audit.entries[0]?.action).toBe('property.portal_paused');
  });

  it('reads the listings in batches and skips the ones the portal does not report', async () => {
    const { uow, reader, reconcile } = setup();
    for (let n = 1; n <= 51; n += 1) seedPublished(uow, n);
    reader.remote.set('MLA51', EXPIRED);

    const outcome = unwrap(await reconcile.execute({ portal: 'mercadolibre' }, PORTAL_SYNC));

    expect(reader.reads.map((ids) => ids.length)).toEqual([50, 1]);
    expect(outcome).toEqual({ checked: 1, changed: 1 });
  });

  it('does not ask the portal for listings that are closed', async () => {
    const { uow, reader, reconcile } = setup();
    const id = seedPublished(uow, 1);
    const snapshot = uow.listings.rows.get(id);
    if (!snapshot) throw new Error('seeded listing missing');
    const listing = Listing.restore(snapshot);
    listing.recordClosed(new Date(NOW));
    uow.listings.rows.set(id, listing.toSnapshot());

    expect(unwrap(await reconcile.execute({ portal: 'mercadolibre' }, PORTAL_SYNC))).toEqual({
      checked: 0,
      changed: 0,
    });
    expect(reader.reads).toEqual([]);
  });

  it('does nothing without a connected account or on a portal that is not reconciled', async () => {
    const { uow, reader, reconcile } = setup();
    uow.accounts.rows.clear();
    seedPublished(uow, 1);
    connect(uow, 'zonaprop');
    seedPublished(uow, 2, 'zonaprop');

    for (const portal of ['mercadolibre', 'zonaprop'] as const) {
      expect(unwrap(await reconcile.execute({ portal }, PORTAL_SYNC))).toEqual({
        checked: 0,
        changed: 0,
      });
    }
    expect(reader.reads).toEqual([]);
  });

  it('fails when the portal does not answer, without touching the listings', async () => {
    const { uow, reader, reconcile } = setup();
    const id = seedPublished(uow, 1);
    reader.failWith = { type: 'PortalUnavailable' };

    expect(unwrapErr(await reconcile.execute({ portal: 'mercadolibre' }, PORTAL_SYNC))).toEqual({
      type: 'PortalUnavailable',
    });
    expect(uow.listings.rows.get(id)?.status).toBe('published');
  });

  it('rejects an unknown portal', async () => {
    const { reconcile } = setup();
    expect(
      unwrapErr(await reconcile.execute({ portal: 'argenprop' as never }, PORTAL_SYNC)).type,
    ).toBe('ValidationFailed');
  });

  it('requires portals:sync', async () => {
    const { reconcile } = setup();
    expect(unwrapErr(await reconcile.execute({ portal: 'mercadolibre' }, ADMIN))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('NotifyListingChanged', () => {
  const NOTICE = { provider: 'mercadolibre', externalAccountId: '3773207548' } as const;

  function notifySetup() {
    const { uow } = setup();
    return { uow, notify: new NotifyListingChanged({ uow, clock: new FixedClock(NOW) }) };
  }

  it('asks to reconcile a live listing of a connected account', async () => {
    const { uow, notify } = notifySetup();
    const id = seedPublished(uow, 7);

    const result = unwrap(await notify.execute({ ...NOTICE, remoteId: 'MLA7' }, PORTAL_SYNC));

    expect(result).toEqual({ portal: 'mercadolibre' });
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.listing_changed_on_portal',
        aggregateId: id,
        payload: { listingId: id },
      }),
    ]);
  });

  it('ignores items that are not Norde listings or accounts that are not connected', async () => {
    const { uow, notify } = notifySetup();
    seedPublished(uow, 7);

    expect(unwrap(await notify.execute({ ...NOTICE, remoteId: 'MLA8' }, PORTAL_SYNC))).toEqual({
      portal: undefined,
    });
    expect(
      unwrap(
        await notify.execute(
          { ...NOTICE, externalAccountId: '999', remoteId: 'MLA7' },
          PORTAL_SYNC,
        ),
      ),
    ).toEqual({ portal: undefined });
    expect(uow.events.published).toEqual([]);
  });

  it('validates the item ID and requires portals:sync', async () => {
    const { notify } = notifySetup();
    expect(
      unwrapErr(await notify.execute({ ...NOTICE, remoteId: '/items/1' }, PORTAL_SYNC)),
    ).toMatchObject({ type: 'ValidationFailed' });
    expect(unwrapErr(await notify.execute({ ...NOTICE, remoteId: 'MLA7' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ReconcileListing', () => {
  function oneSetup() {
    const { uow, reader } = setup();
    return {
      uow,
      reader,
      reconcile: new ReconcileListing({ uow, reader, clock: new FixedClock(NOW) }),
    };
  }

  it('reflects what the portal did to that listing and audits it', async () => {
    const { uow, reader, reconcile } = oneSetup();
    const id = seedPublished(uow, 3);
    seedPublished(uow, 4);
    reader.remote.set('MLA3', EXPIRED);

    expect(unwrap(await reconcile.execute({ listingId: id }, PORTAL_SYNC))).toBe(true);

    expect(reader.reads).toEqual([['MLA3']]);
    expect(uow.listings.rows.get(id)).toMatchObject({ status: 'unpublished', intent: 'closed' });
    expect(uow.audit.entries[0]?.action).toBe('property.portal_unpublished');
  });

  it('does nothing when the portal reports the same state, or nothing', async () => {
    const { uow, reader, reconcile } = oneSetup();
    const id = seedPublished(uow, 3);
    reader.remote.set('MLA3', { state: 'active', reason: undefined });
    expect(unwrap(await reconcile.execute({ listingId: id }, PORTAL_SYNC))).toBe(false);
    reader.remote.clear();
    expect(unwrap(await reconcile.execute({ listingId: id }, PORTAL_SYNC))).toBe(false);
    expect(
      unwrap(
        await reconcile.execute({ listingId: '01920000-0000-7000-8000-0000000009ff' }, PORTAL_SYNC),
      ),
    ).toBe(false);
    expect(uow.audit.entries).toEqual([]);
  });

  it('reports a portal that does not answer, and requires portals:sync', async () => {
    const { uow, reader, reconcile } = oneSetup();
    const id = seedPublished(uow, 3);
    reader.failWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await reconcile.execute({ listingId: id }, PORTAL_SYNC))).toEqual({
      type: 'PortalUnavailable',
    });
    expect(unwrapErr(await reconcile.execute({ listingId: id }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetPortalPackages', () => {
  function packagesSetup() {
    const uow = new InMemoryPortalsUnitOfWork();
    connect(uow);
    const reader = new FakePortalPackageReader();
    return { uow, reader, get: new GetPortalPackages({ accounts: uow.accounts, reader }) };
  }

  it('reads the active packages of the connected account', async () => {
    const { reader, get } = packagesSetup();

    const packages = unwrap(await get.execute({ portal: 'mercadolibre' }, AGENT));

    expect(packages).toEqual([
      {
        id: '754985',
        name: 'Paquete 15 Básico',
        content: 'publications',
        expiresAt: new Date('2026-11-22T18:34:47.544Z'),
        quotas: [{ tier: 'silver', total: 15, used: 3, remaining: 12 }],
      },
    ]);
    expect(reader.reads).toEqual([{ portal: 'mercadolibre', externalAccountId: '3773207548' }]);
    expect(unwrap(await get.execute({ portal: 'mercadolibre' }, ADMIN))).toHaveLength(1);
  });

  it('fails without a connected account', async () => {
    const { get } = packagesSetup();
    expect(unwrapErr(await get.execute({ portal: 'mercadolibre_developments' }, ADMIN))).toEqual({
      type: 'PortalNotConnected',
    });
  });

  it('passes on the portal errors', async () => {
    const { reader, get } = packagesSetup();
    reader.failWith = { type: 'PortalCredentialsMissing' };
    expect(unwrapErr(await get.execute({ portal: 'mercadolibre' }, ADMIN))).toEqual({
      type: 'PortalCredentialsMissing',
    });
  });

  it('rejects a portal connected by its account code', async () => {
    const { get } = packagesSetup();
    expect(unwrapErr(await get.execute({ portal: 'zonaprop' }, ADMIN))).toEqual({
      type: 'WrongConnectionMethod',
    });
  });

  it('rejects an unknown portal', async () => {
    const { get } = packagesSetup();
    expect(unwrapErr(await get.execute({ portal: 'argenprop' as never }, ADMIN)).type).toBe(
      'ValidationFailed',
    );
  });

  it('requires portals:manage or portals:publish', async () => {
    const { get } = packagesSetup();
    expect(unwrapErr(await get.execute({ portal: 'mercadolibre' }, VIEWER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetListingStats', () => {
  function statsSetup() {
    const { uow } = setup();
    const reader = new FakePortalListingStatsReader();
    return { uow, reader, get: new GetListingStats({ uow, reader, clock: new FixedClock(NOW) }) };
  }

  it('reads the visits and contacts of the last 30 days from the portal', async () => {
    const { uow, reader, get } = statsSetup();
    const id = seedPublished(uow, 5);

    const stats = unwrap(await get.execute({ listingId: id }, AGENT));

    expect(stats).toEqual({
      listingId: id,
      days: 30,
      totalVisits: 950,
      visits: 120,
      questions: 3,
      phoneViews: 5,
      whatsapp: 8,
    });
    expect(reader.reads).toEqual([
      { portal: 'mercadolibre', externalId: 'MLA5', endingAt: new Date(NOW), days: 30 },
    ]);
    expect(unwrap(await get.execute({ listingId: id }, ADMIN)).visits).toBe(120);
  });

  it('says when the portal gives no stats or the listing has no item yet', async () => {
    const { uow, reader, get } = statsSetup();
    const zonaprop = seedPublished(uow, 6, 'zonaprop');
    const pending = unwrap(parseId<'Listing'>('01920000-0000-7000-8000-0000000000f1'));
    uow.listings.rows.set(
      pending,
      Listing.request({
        id: pending,
        portal: 'mercadolibre',
        owner: { kind: 'property', id: LISTED_PROPERTY_ID },
        operation: 'sale',
        listingType: 'simple',
        plan: undefined,
        now: new Date(NOW),
      }).toSnapshot(),
    );

    for (const listingId of [zonaprop, pending]) {
      expect(unwrapErr(await get.execute({ listingId }, AGENT))).toEqual({
        type: 'ListingStatsNotAvailable',
      });
    }
    expect(
      unwrapErr(await get.execute({ listingId: '01920000-0000-7000-8000-0000000009ff' }, AGENT)),
    ).toEqual({ type: 'ListingNotFound' });
    expect(reader.reads).toEqual([]);
  });

  it('reports a portal that does not answer, and requires a portals permission', async () => {
    const { uow, reader, get } = statsSetup();
    const id = seedPublished(uow, 5);
    reader.failWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await get.execute({ listingId: id }, AGENT))).toEqual({
      type: 'PortalUnavailable',
    });
    expect(unwrapErr(await get.execute({ listingId: id }, VIEWER))).toEqual({ type: 'Forbidden' });
  });
});
