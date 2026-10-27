import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { PortalAccount } from '../domain/portal-account';
import {
  FakeDevelopmentListingSourceReader,
  FakeListingSourceReader,
  FakePortalAccountDirectory,
  FakePortalConnector,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
  listingSource,
} from '../testing';
import { ChangeListingPlan } from './commands/change-listing-plan';
import { PauseListing } from './commands/pause-listing';
import { RequestPublication } from './commands/request-publication';
import { ResumeListing } from './commands/resume-listing';
import { SyncListing } from './commands/sync-listing';
import { GetPropertyListings } from './queries/get-property-listings';

// Zonaprop: un aviso por propiedad, con todas sus operaciones con precio y el plan elegido.

const AGENT = Actor.user('agent-1', ['portals:publish']);
const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const NOW = '2026-10-16T12:00:00.000Z';
const ZONAPROP = { propertyId: LISTED_PROPERTY_ID, portal: 'zonaprop', plan: 'SIMPLE' } as const;

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
  const connector = new FakePortalConnector();
  const directory = new FakePortalAccountDirectory();
  const clock = new FixedClock(NOW);
  const developments = new FakeDevelopmentListingSourceReader();
  const deps = { uow, reader, developments, connector, clock };
  return {
    ...deps,
    directory,
    request: new RequestPublication({ ...deps, directory, ids: new SequentialIdGenerator() }),
    sync: new SyncListing(deps),
    pause: new PauseListing({ uow, clock }),
    resume: new ResumeListing({ uow, directory, clock }),
    changePlan: new ChangeListingPlan({ uow, directory, clock }),
    list: new GetPropertyListings({ uow }),
  };
}

async function published() {
  const s = setup();
  const { listingId } = unwrap(await s.request.execute(ZONAPROP, AGENT));
  unwrap(await s.sync.execute({ listingId }, PORTAL_SYNC));
  s.connector.calls.length = 0;
  return { ...s, listingId };
}

describe('RequestPublication on Zonaprop', () => {
  it('asks for one listing of the whole property with the plan and audits it', async () => {
    const { request, uow, directory } = setup();

    const { listingId } = unwrap(await request.execute(ZONAPROP, AGENT));

    expect([...uow.listings.rows.values()]).toEqual([
      expect.objectContaining({
        id: listingId,
        portal: 'zonaprop',
        operation: undefined,
        plan: 'SIMPLE',
        status: 'pending',
      }),
    ]);
    expect(directory.creditReads).toEqual([{ portal: 'zonaprop', externalAccountId: '17310373' }]);
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
              portal: 'zonaprop',
              operation: null,
              listingType: 'simple',
              plan: 'SIMPLE',
              externalId: null,
            },
          },
        },
      }),
    ]);
  });

  it('offers Zonaprop on the property with its listing shape', async () => {
    const { list } = setup();
    expect(unwrap(await list.execute({ propertyId: LISTED_PROPERTY_ID }, AGENT)).portals).toEqual([
      {
        portal: 'zonaprop',
        listingScope: 'property',
        choosesPlan: true,
        linksExisting: true,
        unitsAsListings: false,
      },
    ]);
  });

  it('requires a plan', async () => {
    const { request } = setup();
    expect(
      unwrapErr(
        await request.execute({ propertyId: LISTED_PROPERTY_ID, portal: 'zonaprop' }, AGENT),
      ),
    ).toEqual({ type: 'PlanRequired' });
  });

  it('does not take an operation: the listing carries all of them', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute({ ...ZONAPROP, operation: 'sale' }, AGENT)).type).toBe(
      'ValidationFailed',
    );
  });

  it('rejects a plan the account does not have for properties', async () => {
    const { request, uow } = setup();
    expect(
      unwrapErr(await request.execute({ ...ZONAPROP, plan: 'DESARROLLOS_HOME' }, AGENT)),
    ).toEqual({ type: 'PlanNotOffered', plan: 'DESARROLLOS_HOME' });
    expect(uow.listings.rows.size).toBe(0);
  });

  it('rejects a plan without credits left', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute({ ...ZONAPROP, plan: 'HOME' }, AGENT))).toEqual({
      type: 'NoCreditsLeft',
      plan: 'HOME',
    });
  });

  it('returns the portal error when it cannot read the credits', async () => {
    const { request, directory } = setup();
    directory.creditsFailWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await request.execute(ZONAPROP, AGENT))).toEqual({
      type: 'PortalUnavailable',
    });
  });

  it('needs an enabled account', async () => {
    const { request, uow, directory } = setup();
    uow.accounts.rows.set('zonaprop', zonapropAccount(false));
    expect(unwrapErr(await request.execute(ZONAPROP, AGENT))).toEqual({
      type: 'PortalNotEnabled',
      portal: 'zonaprop',
    });
    expect(directory.creditReads).toHaveLength(0);
  });

  it('needs at least one operation with a price', async () => {
    const { request, reader } = setup();
    reader.sources.set(
      LISTED_PROPERTY_ID,
      listingSource({
        operations: [
          { operation: 'sale', currency: 'USD', priceCents: undefined, priceOnRequest: true },
        ],
      }),
    );
    expect(unwrapErr(await request.execute(ZONAPROP, AGENT))).toEqual({ type: 'PriceRequired' });
  });

  it('does not ask twice for the same property', async () => {
    const { request } = await published();
    expect(unwrapErr(await request.execute(ZONAPROP, AGENT))).toEqual({
      type: 'ListingAlreadyExists',
    });
  });

  it('still asks for the operation and rejects a plan on MercadoLibre', async () => {
    const { request } = setup();
    const ml = { propertyId: LISTED_PROPERTY_ID, portal: 'mercadolibre' } as const;
    expect(unwrapErr(await request.execute(ml, AGENT)).type).toBe('ValidationFailed');
    expect(
      unwrapErr(await request.execute({ ...ml, operation: 'sale', plan: 'SIMPLE' }, AGENT)).type,
    ).toBe('ValidationFailed');
  });
});

describe('SyncListing on Zonaprop', () => {
  it('creates the listing with its id, the plan and no single operation', async () => {
    const { request, sync, connector } = setup();
    const { listingId } = unwrap(await request.execute(ZONAPROP, AGENT));

    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(connector.calls.map((c) => c.method)).toEqual(['create']);
    expect(connector.calls[0]?.content).toMatchObject({
      kind: 'property',
      listingId,
      plan: 'SIMPLE',
      operation: undefined,
    });
  });

  it('pauses and resumes through the connector with the full content', async () => {
    const { pause, resume, sync, connector, listingId } = await published();
    const calls: { state?: string; contentChanged: boolean }[] = [];
    const update = connector.update.bind(connector);
    connector.update = (portal, externalId, change) => {
      calls.push({ state: change.state, contentChanged: change.contentChanged });
      expect(change.content.listingId).toBe(listingId);
      return update(portal, externalId, change);
    };

    unwrap(await pause.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    unwrap(await resume.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));

    expect(calls).toEqual([
      { state: 'paused', contentChanged: false },
      { state: 'active', contentChanged: false },
    ]);
  });

  it('checks the credits before putting a paused listing online again', async () => {
    const { pause, resume, sync, directory, uow, listingId } = await published();
    unwrap(await pause.execute({ listingId }, AGENT));
    unwrap(await sync.execute({ listingId }, PORTAL_SYNC));
    directory.availableCredits = [
      { plan: 'SIMPLE', available: 0, contracted: 50, publishes: 'property' },
    ];

    expect(unwrapErr(await resume.execute({ listingId }, AGENT))).toEqual({
      type: 'NoCreditsLeft',
      plan: 'SIMPLE',
    });
    expect(uow.listings.rows.get(listingId)?.intent).toBe('paused');

    directory.availableCredits = [
      { plan: 'SIMPLE', available: 1, contracted: 50, publishes: 'property' },
    ];
    unwrap(await resume.execute({ listingId }, AGENT));
    expect(uow.listings.rows.get(listingId)?.intent).toBe('active');
  });

  it('does not read the credits to resume a listing that is not paused', async () => {
    const { resume, directory, listingId } = await published();
    directory.creditReads.length = 0;
    unwrap(await resume.execute({ listingId }, AGENT));
    expect(directory.creditReads).toEqual([]);
  });

  it('takes the listing offline when no operation has a price, and back when it has one', async () => {
    const { sync, reader, uow, connector, listingId } = await published();
    reader.sources.set(
      LISTED_PROPERTY_ID,
      listingSource({
        title: 'Otro título',
        operations: [
          { operation: 'sale', currency: 'USD', priceCents: undefined, priceOnRequest: true },
        ],
      }),
    );

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');
    expect(uow.listings.rows.get(listingId)?.status).toBe('paused');
    expect(uow.listings.rows.get(listingId)?.lastError).toContain('sin precio');
    expect(uow.audit.entries.at(-1)?.action).toBe('property.portal_paused');
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('unchanged');

    reader.sources.set(LISTED_PROPERTY_ID, listingSource({ title: 'Otro título' }));
    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    expect(connector.calls.map((c) => [c.state, c.content !== undefined])).toEqual([
      ['paused', false],
      ['active', true],
    ]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      status: 'published',
      lastError: undefined,
    });
  });

  it('pauses a reserved property even if its content lost what the portal requires', async () => {
    const { sync, reader, uow, connector, listingId } = await published();
    connector.problemsFound = ['La descripción tiene que tener al menos 50 caracteres.'];
    reader.sources.set(
      LISTED_PROPERTY_ID,
      listingSource({
        availability: 'paused',
        description: 'Corta',
        operations: [
          { operation: 'sale', currency: 'USD', priceCents: undefined, priceOnRequest: true },
        ],
      }),
    );

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    expect(connector.calls.map((c) => [c.method, c.state, c.content !== undefined])).toEqual([
      ['update', 'paused', false],
    ]);
    expect(uow.listings.rows.get(listingId)).toMatchObject({
      status: 'paused',
      lastError: undefined,
    });
  });
});

describe('ChangeListingPlan', () => {
  it('changes the plan, resends the listing and audits it on the property', async () => {
    const { changePlan, uow, directory, listingId } = await published();
    directory.availableCredits = [
      { plan: 'SIMPLE', available: 40, contracted: 50, publishes: 'property' },
      { plan: 'HOME', available: 3, contracted: 5, publishes: 'property' },
    ];

    unwrap(await changePlan.execute({ listingId, plan: 'HOME' }, AGENT));

    expect(uow.listings.rows.get(listingId)).toMatchObject({
      plan: 'HOME',
      contentHash: undefined,
    });
    expect(uow.audit.entries.at(-1)).toEqual(
      expect.objectContaining({
        action: 'property.portal_plan_changed',
        entityId: LISTED_PROPERTY_ID,
        changes: { [`listings.${listingId}.plan`]: { before: 'SIMPLE', after: 'HOME' } },
      }),
    );
  });

  it('rejects a plan without credits and keeps the current one', async () => {
    const { changePlan, uow, listingId } = await published();
    expect(unwrapErr(await changePlan.execute({ listingId, plan: 'HOME' }, AGENT))).toEqual({
      type: 'NoCreditsLeft',
      plan: 'HOME',
    });
    expect(uow.listings.rows.get(listingId)?.plan).toBe('SIMPLE');
  });

  it('does nothing when the plan is the same', async () => {
    const { changePlan, uow, directory, listingId } = await published();
    const audits = uow.audit.entries.length;
    unwrap(await changePlan.execute({ listingId, plan: 'SIMPLE' }, AGENT));
    expect(uow.audit.entries).toHaveLength(audits);
    expect(directory.creditReads).toHaveLength(1);
  });

  it('requires portals:publish', async () => {
    const { changePlan, listingId } = await published();
    const viewer = Actor.user('agent-2', ['properties:read']);
    expect(unwrapErr(await changePlan.execute({ listingId, plan: 'HOME' }, viewer))).toEqual({
      type: 'Forbidden',
    });
  });
});
