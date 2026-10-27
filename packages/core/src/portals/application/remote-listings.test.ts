import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { PortalAccount } from '../domain/portal-account';
import {
  FakeDevelopmentListingSourceReader,
  FakeListingSourceReader,
  FakePortalAccountDirectory,
  FakePortalConnector,
  FakePortalListingCatalog,
  FakePropertyCodeLookup,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
  listingSource,
  remoteListing,
} from '../testing';
import { LinkPortalListing } from './commands/link-portal-listing';
import { RequestPublication } from './commands/request-publication';
import { SyncListing } from './commands/sync-listing';
import { UnpublishListing } from './commands/unpublish-listing';
import { ListRemoteListings } from './queries/list-remote-listings';

// Vincular los avisos que Tokko ya publicó en Zonaprop, sin republicarlos.

const MANAGER = Actor.user('admin-1', ['portals:*']);
const AGENT = Actor.user('agent-1', ['portals:publish']);
const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const NOW = '2026-10-16T12:00:00.000Z';
const LINK = { portal: 'zonaprop', propertyId: LISTED_PROPERTY_ID, remoteId: '50044229' } as const;

function zonapropAccount(enabled = true) {
  const account = PortalAccount.notConnected('zonaprop');
  unwrap(
    account.connect(
      {
        externalAccountId: '17310373',
        accountName: 'Norde Propiedades',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
      [],
      false,
    ),
  );
  if (enabled) unwrap(account.enable());
  return account.toSnapshot();
}

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  uow.accounts.rows.set('zonaprop', zonapropAccount());
  const reader = new FakeListingSourceReader();
  reader.sources.set(LISTED_PROPERTY_ID, listingSource());
  const catalog = new FakePortalListingCatalog();
  const properties = new FakePropertyCodeLookup();
  const connector = new FakePortalConnector();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  return {
    uow,
    reader,
    catalog,
    properties,
    connector,
    list: new ListRemoteListings({ uow, catalog, properties }),
    link: new LinkPortalListing({ uow, catalog, reader, ids, clock }),
    sync: new SyncListing({
      uow,
      reader,
      developments: new FakeDevelopmentListingSourceReader(),
      connector,
      clock,
    }),
    unpublish: new UnpublishListing({ uow, clock }),
    request: new RequestPublication({
      uow,
      reader,
      connector,
      directory: new FakePortalAccountDirectory(),
      ids,
      clock,
    }),
  };
}

describe('ListRemoteListings', () => {
  it('lists a page of online listings with the property that has the same code', async () => {
    const { list, catalog, properties } = setup();
    catalog.listings = [
      remoteListing(),
      remoteListing({ remoteId: '50044230', code: 'PRO1', reference: 'OTRO-1', title: 'Otro' }),
    ];

    const page = unwrap(await list.execute({ portal: 'zonaprop', page: 1, pageSize: 20 }, MANAGER));

    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(page.items[0]).toMatchObject({
      remoteId: '50044229',
      reference: 'NHO1142594',
      plan: 'HOME',
      match: { propertyId: LISTED_PROPERTY_ID, code: 'NHO1142594' },
      linked: undefined,
    });
    expect(page.items[1]?.match).toBeUndefined();
    expect(catalog.pages).toEqual([{ offset: 0, limit: 20 }]);
    expect(properties.calls).toEqual([['NHO1142594', 'PRO3621230', 'OTRO-1', 'PRO1']]);
  });

  it('asks the portal for the requested page', async () => {
    const { list, catalog } = setup();
    unwrap(await list.execute({ portal: 'zonaprop', page: 3, pageSize: 10 }, MANAGER));
    expect(catalog.pages).toEqual([{ offset: 20, limit: 10 }]);
  });

  it('marks the listings already linked', async () => {
    const { list, link, catalog } = setup();
    const { listingId } = unwrap(await link.execute(LINK, AGENT));
    catalog.listings = [remoteListing({ code: listingId.replaceAll('-', '') })];

    const page = unwrap(await list.execute({ portal: 'zonaprop' }, MANAGER));

    expect(page.items[0]?.linked).toEqual({
      listingId,
      owner: { kind: 'property', id: LISTED_PROPERTY_ID },
    });
  });

  it('needs a connected account and portals:manage', async () => {
    const { list, uow } = setup();
    expect(unwrapErr(await list.execute({ portal: 'zonaprop' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
    uow.accounts.rows.delete('zonaprop');
    expect(unwrapErr(await list.execute({ portal: 'zonaprop' }, MANAGER))).toEqual({
      type: 'PortalNotConnected',
    });
  });

  it('only works on portals that link existing listings', async () => {
    const { list } = setup();
    expect(
      unwrapErr(await list.execute({ portal: 'mercadolibre_developments' }, MANAGER)).type,
    ).toBe('ValidationFailed');
  });

  it('returns the portal error', async () => {
    const { list, catalog } = setup();
    catalog.failWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await list.execute({ portal: 'zonaprop' }, MANAGER))).toEqual({
      type: 'PortalUnavailable',
    });
  });
});

describe('LinkPortalListing', () => {
  it('takes the listing for the property, with its plan and link, and audits it', async () => {
    const { link, uow, catalog } = setup();

    const { listingId } = unwrap(await link.execute(LINK, AGENT));

    expect(catalog.links).toEqual([{ remoteId: '50044229', listingId }]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      portal: 'zonaprop',
      owner: { kind: 'property', id: LISTED_PROPERTY_ID },
      operation: undefined,
      plan: 'HOME',
      status: 'published',
      intent: 'active',
      externalId: listingId.replaceAll('-', ''),
      permalink: 'https://portal.test/propiedades/clasificado/-50044229.html',
    });
    // No pide sincronizar: el aviso queda como lo dejó Tokko.
    expect(uow.events.published).toEqual([]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.portal_listing_linked',
        entityType: 'property',
        entityId: LISTED_PROPERTY_ID,
      }),
    ]);
    expect(uow.audit.entries[0]?.changes?.[`listings.${listingId}`]?.after).toMatchObject({
      portal: 'zonaprop',
      plan: 'HOME',
      remoteId: '50044229',
    });
  });

  it('accepts the link copied from the portal', async () => {
    const { link, catalog } = setup();
    unwrap(
      await link.execute(
        {
          ...LINK,
          remoteId:
            'https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-casa-50044229.html',
        },
        AGENT,
      ),
    );
    expect(catalog.links[0]?.remoteId).toBe('50044229');
  });

  it('does not resend the listing until the property changes', async () => {
    const { link, sync, reader, connector } = setup();
    const { listingId } = unwrap(await link.execute(LINK, AGENT));

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');
    expect(connector.calls).toEqual([]);

    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ title: 'Nuevo título' }));
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');
    expect(connector.calls.map((c) => c.method)).toEqual(['update']);
  });

  it('asks for the plan when the portal does not report it', async () => {
    const { link, catalog } = setup();
    catalog.listings = [remoteListing({ plan: undefined })];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'PlanRequired' });
    const { listingId } = unwrap(await link.execute({ ...LINK, plan: 'SIMPLE' }, AGENT));
    expect(listingId).toBeDefined();
  });

  it('rejects a listing the portal does not have online', async () => {
    const { link, catalog } = setup();
    catalog.listings = [];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'RemoteListingNotFound' });
    expect(catalog.links).toEqual([]);
  });

  it('links developments from the development, not from a property', async () => {
    const { link, catalog } = setup();
    catalog.listings = [remoteListing({ isDevelopment: true })];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({
      type: 'RemoteListingIsDevelopment',
    });
  });

  it('does not link a listing twice', async () => {
    const { link, catalog, reader } = setup();
    const { listingId } = unwrap(await link.execute(LINK, AGENT));
    catalog.listings = [remoteListing({ code: listingId.replaceAll('-', '') })];
    const other = '01920000-0000-7000-8000-0000000000b2';
    reader.sources.set(other, listingSource({ propertyId: other }));

    expect(unwrapErr(await link.execute({ ...LINK, propertyId: other }, AGENT))).toEqual({
      type: 'RemoteListingAlreadyLinked',
      owner: { kind: 'property', id: LISTED_PROPERTY_ID },
    });
  });

  it('does not link a property that is already published on the portal', async () => {
    const { request, link } = setup();
    unwrap(
      await request.execute(
        { propertyId: LISTED_PROPERTY_ID, portal: 'zonaprop', plan: 'SIMPLE' },
        AGENT,
      ),
    );
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'ListingAlreadyExists' });
  });

  it('reuses the unpublished listing of the property', async () => {
    const { link, unpublish, sync, uow, catalog } = setup();
    const first = unwrap(await link.execute(LINK, AGENT));
    unwrap(await unpublish.execute({ listingId: first.listingId }, AGENT));
    unwrap(await sync.execute({ listingId: first.listingId }, PORTAL_SYNC));
    catalog.listings = [remoteListing({ remoteId: '50044231', code: 'PRO9' })];

    const again = unwrap(await link.execute({ ...LINK, remoteId: '50044231' }, AGENT));

    expect(again.listingId).toBe(first.listingId);
    expect(uow.listings.rows.get(first.listingId)).toMatchObject({
      status: 'published',
      intent: 'active',
    });
  });

  it('returns the portal error and saves nothing', async () => {
    const { link, catalog, uow } = setup();
    catalog.linkFailWith = { type: 'PortalRejected', reason: 'Zonaprop rechazó el cambio.' };
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({
      type: 'PortalRejected',
      reason: 'Zonaprop rechazó el cambio.',
    });
    expect(uow.listings.rows.size).toBe(0);
  });

  it('needs an enabled account and portals:publish', async () => {
    const { link, uow } = setup();
    expect(unwrapErr(await link.execute(LINK, Actor.user('x', ['properties:read'])))).toEqual({
      type: 'Forbidden',
    });
    uow.accounts.rows.set('zonaprop', zonapropAccount(false));
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({
      type: 'PortalNotEnabled',
      portal: 'zonaprop',
    });
  });

  it('rejects a remote id that is not a listing number or link', async () => {
    const { link } = setup();
    expect(unwrapErr(await link.execute({ ...LINK, remoteId: 'casa linda' }, AGENT)).type).toBe(
      'ValidationFailed',
    );
  });
});
