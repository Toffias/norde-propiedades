import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { Listing } from '../domain/listing';
import type { PortalId } from '../domain/portal';
import { PortalAccount } from '../domain/portal-account';
import {
  FakePortalListingStateReader,
  FakePortalPackageReader,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
} from '../testing';
import { ReconcileListings } from './commands/reconcile-listings';
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
