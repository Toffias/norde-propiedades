import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { PortalAccount } from '../domain/portal-account';
import {
  FakeDevelopmentCodeLookup,
  FakeDevelopmentListingSourceReader,
  FakeListingSourceReader,
  FakePortalAccountDirectory,
  FakePortalConnector,
  FakePortalListingCatalog,
  InMemoryPortalsUnitOfWork,
  LISTED_DEVELOPMENT_ID,
  LISTED_UNIT_ID,
  developmentListingSource,
  listingSource,
  remoteDevelopment,
} from '../testing';
import { ChangeListingPlan } from './commands/change-listing-plan';
import { LinkDevelopmentListing } from './commands/link-development-listing';
import { RequestDevelopmentPublication } from './commands/request-development-publication';
import { RequestListingSync } from './commands/request-listing-sync';
import { SyncListing } from './commands/sync-listing';
import { UnpublishListing } from './commands/unpublish-listing';
import { publishableUnits } from './listing-plan';
import { GetDevelopmentListings } from './queries/get-development-listings';
import { ListRemoteDevelopments } from './queries/list-remote-developments';

// Emprendimientos en Zonaprop: un aviso con todas las unidades disponibles con precio.

const MANAGER = Actor.user('admin-1', ['portals:*']);
const AGENT = Actor.user('agent-1', ['portals:publish']);
const VIEWER = Actor.user('viewer-1', ['properties:read']);
const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const NOW = '2026-10-16T12:00:00.000Z';
const PUBLISH = {
  developmentId: LISTED_DEVELOPMENT_ID,
  portal: 'zonaprop',
  plan: 'DESARROLLOS_HOME',
} as const;
const LINK = {
  portal: 'zonaprop',
  developmentId: LISTED_DEVELOPMENT_ID,
  remoteId: '59677897',
} as const;

function zonapropAccount() {
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
    ),
  );
  unwrap(account.enable());
  return account.toSnapshot();
}

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  uow.accounts.rows.set('zonaprop', zonapropAccount());
  const reader = new FakeListingSourceReader();
  const developments = new FakeDevelopmentListingSourceReader();
  developments.sources.set(LISTED_DEVELOPMENT_ID, developmentListingSource());
  const connector = new FakePortalConnector();
  const directory = new FakePortalAccountDirectory();
  const catalog = new FakePortalListingCatalog();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  const deps = { uow, reader, developments, connector, clock };
  return {
    ...deps,
    directory,
    catalog,
    request: new RequestDevelopmentPublication({
      uow,
      developments,
      connector,
      directory,
      ids,
      clock,
    }),
    sync: new SyncListing(deps),
    requestSync: new RequestListingSync({ uow, clock }),
    unpublish: new UnpublishListing({ uow, clock }),
    changePlan: new ChangeListingPlan({ uow, directory, clock }),
    list: new GetDevelopmentListings({ uow }),
    link: new LinkDevelopmentListing({ uow, catalog, developments, ids, clock }),
    remote: new ListRemoteDevelopments({
      uow,
      catalog,
      developments: new FakeDevelopmentCodeLookup(),
    }),
  };
}

async function published() {
  const s = setup();
  const { listingId } = unwrap(await s.request.execute(PUBLISH, AGENT));
  unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC));
  s.connector.calls.length = 0;
  return { ...s, listingId };
}

describe('publishableUnits', () => {
  it('keeps the available units with a priced operation', () => {
    const priced = listingSource({ code: 'AP1' });
    const reserved = listingSource({ code: 'AP2', availability: 'paused' });
    const onRequest = listingSource({
      code: 'AP3',
      operations: [
        { operation: 'sale', currency: 'USD', priceCents: undefined, priceOnRequest: true },
      ],
    });
    expect(publishableUnits([priced, reserved, onRequest]).map((u) => u.code)).toEqual(['AP1']);
  });
});

describe('RequestDevelopmentPublication', () => {
  it('asks for one listing of the development with the plan and audits it', async () => {
    const { request, uow, directory } = setup();

    const { listingId } = unwrap(await request.execute(PUBLISH, AGENT));

    expect(uow.listings.rows.get(listingId)).toMatchObject({
      portal: 'zonaprop',
      owner: { kind: 'development', id: LISTED_DEVELOPMENT_ID },
      operation: undefined,
      plan: 'DESARROLLOS_HOME',
      status: 'pending',
    });
    expect(directory.creditReads).toEqual([{ portal: 'zonaprop', externalAccountId: '17310373' }]);
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.listing_sync_requested',
        payload: { listingId, ownerKind: 'development', ownerId: LISTED_DEVELOPMENT_ID },
      }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.portal_publish_requested',
        entityType: 'development',
        entityId: LISTED_DEVELOPMENT_ID,
        clientIds: [],
        changes: {
          [`listings.${listingId}`]: {
            before: null,
            after: {
              listingId,
              portal: 'zonaprop',
              operation: null,
              listingType: 'simple',
              plan: 'DESARROLLOS_HOME',
              externalId: null,
            },
          },
        },
      }),
    ]);
  });

  it('only offers the plans for developments, with credits left', async () => {
    const { request, directory } = setup();
    expect(unwrapErr(await request.execute({ ...PUBLISH, plan: 'SIMPLE' }, AGENT))).toEqual({
      type: 'PlanNotOffered',
      plan: 'SIMPLE',
    });
    directory.availableCredits = [
      { plan: 'DESARROLLOS_HOME', available: 0, contracted: 2, publishes: 'development' },
    ];
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'NoCreditsLeft',
      plan: 'DESARROLLOS_HOME',
    });
  });

  it('asks for the plan', async () => {
    const { request } = setup();
    expect(
      unwrapErr(
        await request.execute({ developmentId: LISTED_DEVELOPMENT_ID, portal: 'zonaprop' }, AGENT),
      ),
    ).toEqual({ type: 'PlanRequired' });
  });

  it('does not publish developments through accounts that do not publish them', async () => {
    const { request } = setup();
    expect(
      unwrapErr(
        await request.execute(
          { developmentId: LISTED_DEVELOPMENT_ID, portal: 'mercadolibre_developments' },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'PortalNotForDevelopments' });
  });

  it('needs a development marketing with units to publish', async () => {
    const { request, developments } = setup();
    developments.sources.set(
      LISTED_DEVELOPMENT_ID,
      developmentListingSource({ availability: 'paused' }),
    );
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'DevelopmentNotMarketing',
    });

    developments.sources.set(LISTED_DEVELOPMENT_ID, developmentListingSource({ units: [] }));
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'NoPublishableUnits',
    });

    developments.sources.clear();
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'DevelopmentNotFound',
    });
  });

  it('returns what the portal is missing', async () => {
    const { request, connector, uow } = setup();
    connector.problemsFound = ['Falta la fecha de entrega.'];
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'MissingListingData',
      problems: ['Falta la fecha de entrega.'],
    });
    expect(uow.listings.rows.size).toBe(0);
  });

  it('does not publish the same development twice, and republishes it after unpublishing', async () => {
    const { request, unpublish, sync, uow, listingId } = await published();
    expect(unwrapErr(await request.execute(PUBLISH, AGENT))).toEqual({
      type: 'ListingAlreadyExists',
    });

    unwrap(await unpublish.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    const again = unwrap(await request.execute(PUBLISH, AGENT));

    expect(again.listingId).toBe(listingId);
    expect(uow.listings.rows.get(listingId)).toMatchObject({ status: 'pending', intent: 'active' });
  });

  it('needs portals:publish', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute(PUBLISH, VIEWER))).toEqual({ type: 'Forbidden' });
  });
});

describe('SyncListing of a development', () => {
  it('creates the listing with the development and its units', async () => {
    const { request, sync, connector, uow } = setup();
    const { listingId } = unwrap(await request.execute(PUBLISH, AGENT));

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    expect(connector.calls).toEqual([
      {
        method: 'create',
        content: {
          kind: 'development',
          listingId,
          source: developmentListingSource(),
          listingType: 'simple',
          plan: 'DESARROLLOS_HOME',
        },
      },
    ]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({ status: 'published' });
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'development.portal_published',
      entityType: 'development',
      entityId: LISTED_DEVELOPMENT_ID,
    });
  });

  it('sends the development again when a unit changes', async () => {
    const { sync, connector, developments, listingId } = await published();
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');

    const [unit] = developmentListingSource().units;
    if (!unit) throw new Error('missing unit');
    developments.sources.set(
      LISTED_DEVELOPMENT_ID,
      developmentListingSource({ units: [{ ...unit, title: 'Departamento con cochera' }] }),
    );
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls).toEqual([
      expect.objectContaining({ method: 'update', state: 'active' }),
    ]);
  });

  it('takes the listing offline when no unit is left, and back when one is available', async () => {
    const { sync, connector, developments, uow, listingId } = await published();
    developments.sources.set(
      LISTED_DEVELOPMENT_ID,
      developmentListingSource({ units: [], availability: 'paused' }),
    );

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');
    expect(connector.calls).toEqual([
      expect.objectContaining({ method: 'update', state: 'paused' }),
    ]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({ status: 'paused', intent: 'active' });

    developments.sources.set(LISTED_DEVELOPMENT_ID, developmentListingSource());
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    expect(uow.listings.rows.get(listingId)).toMatchObject({ status: 'published' });
  });

  it('closes the development listing when the development is gone', async () => {
    const { sync, connector, developments, uow, listingId } = await published();
    developments.sources.clear();

    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls).toEqual([{ method: 'close', externalId: 'MLA1', kind: 'development' }]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      status: 'unpublished',
      intent: 'closed',
    });
  });
});

describe('RequestListingSync of a development', () => {
  it('asks to sync the listings of the development', async () => {
    const { requestSync, uow, listingId } = await published();
    uow.events.published.length = 0;

    const result = unwrap(
      await requestSync.execute({ developmentId: LISTED_DEVELOPMENT_ID }, PORTAL_SYNC),
    );

    expect(result.requested).toBe(1);
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.listing_sync_requested',
        payload: { listingId, ownerKind: 'development', ownerId: LISTED_DEVELOPMENT_ID },
      }),
    ]);
  });
});

describe('ChangeListingPlan of a development', () => {
  it('checks the credits of the development plans', async () => {
    const { changePlan, listingId } = await published();
    expect(unwrapErr(await changePlan.execute({ listingId, plan: 'SIMPLE' }, AGENT))).toEqual({
      type: 'PlanNotOffered',
      plan: 'SIMPLE',
    });
  });
});

describe('GetDevelopmentListings', () => {
  it('lists the listings of the development and the portals that publish developments', async () => {
    const { list, listingId } = await published();

    const view = unwrap(await list.execute({ developmentId: LISTED_DEVELOPMENT_ID }, AGENT));

    expect(view.listings.map((l) => l.id)).toEqual([listingId]);
    expect(view.portals).toEqual([
      { portal: 'zonaprop', listingScope: 'property', choosesPlan: true },
    ]);
    expect(view.canPublish).toBe(true);
  });

  it('needs portals:publish or portals:manage', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({ developmentId: LISTED_DEVELOPMENT_ID }, VIEWER))).toEqual(
      { type: 'Forbidden' },
    );
  });
});

describe('ListRemoteDevelopments', () => {
  it('matches the developments of the portal by code and marks the linked ones', async () => {
    const { remote, link, catalog } = setup();

    const page = unwrap(await remote.execute({ portal: 'zonaprop' }, MANAGER));
    expect(page.items).toEqual([
      expect.objectContaining({
        remoteId: '59677897',
        unitCount: 2,
        match: { developmentId: LISTED_DEVELOPMENT_ID, code: 'EMP0001', name: 'Torre Mataderos' },
        linked: undefined,
      }),
    ]);

    const { listingId } = unwrap(await link.execute(LINK, AGENT));
    catalog.developments = [remoteDevelopment({ code: listingId.replaceAll('-', '') })];
    const linked = unwrap(await remote.execute({ portal: 'zonaprop' }, MANAGER));
    expect(linked.items[0]?.linked).toEqual({ listingId, developmentId: LISTED_DEVELOPMENT_ID });
  });

  it('needs portals:manage', async () => {
    const { remote } = setup();
    expect(unwrapErr(await remote.execute({ portal: 'zonaprop' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('LinkDevelopmentListing', () => {
  it('takes the development and the units with the same code, and audits it', async () => {
    const { link, catalog, uow, sync } = setup();

    const { listingId, linkedUnits } = unwrap(await link.execute(LINK, AGENT));

    expect(linkedUnits).toBe(1);
    expect(catalog.developmentLinks).toEqual([
      {
        remoteId: '59677897',
        listingId,
        units: [{ remoteId: '59677898', propertyId: LISTED_UNIT_ID }],
      },
    ]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      owner: { kind: 'development', id: LISTED_DEVELOPMENT_ID },
      plan: 'DESARROLLOS_HOME',
      status: 'published',
      externalId: listingId.replaceAll('-', ''),
    });
    expect(uow.events.published).toEqual([]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.portal_listing_linked',
        entityType: 'development',
        entityId: LISTED_DEVELOPMENT_ID,
      }),
    ]);
    // Queda como lo dejó Tokko hasta que cambie algo del emprendimiento.
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');
  });

  it('keeps the chosen plan over the one the portal reports', async () => {
    const { link, uow } = setup();
    const { listingId } = unwrap(
      await link.execute({ ...LINK, plan: 'DESARROLLOS_SIMPLE' }, AGENT),
    );
    expect(uow.listings.rows.get(listingId)?.plan).toBe('DESARROLLOS_SIMPLE');
  });

  it('does not link a development twice', async () => {
    const { link, catalog, developments } = setup();
    const { listingId } = unwrap(await link.execute(LINK, AGENT));
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'ListingAlreadyExists' });

    const other = '01920000-0000-7000-8000-0000000000d2';
    developments.sources.set(other, developmentListingSource({ developmentId: other }));
    catalog.developments = [remoteDevelopment({ code: listingId.replaceAll('-', '') })];
    expect(unwrapErr(await link.execute({ ...LINK, developmentId: other }, AGENT))).toEqual({
      type: 'RemoteListingAlreadyLinked',
      owner: { kind: 'development', id: LISTED_DEVELOPMENT_ID },
    });
  });

  it('returns the portal errors and missing listings', async () => {
    const { link, catalog } = setup();
    catalog.developments = [];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'RemoteListingNotFound' });

    catalog.developments = [remoteDevelopment({ plan: undefined })];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'PlanRequired' });

    catalog.linkFailWith = { type: 'PortalRejected', reason: 'Sin permiso.' };
    expect(unwrapErr(await link.execute({ ...LINK, plan: 'DESARROLLOS_HOME' }, AGENT))).toEqual({
      type: 'PortalRejected',
      reason: 'Sin permiso.',
    });
  });

  it('needs portals:publish', async () => {
    const { link } = setup();
    expect(unwrapErr(await link.execute(LINK, VIEWER))).toEqual({ type: 'Forbidden' });
  });
});
