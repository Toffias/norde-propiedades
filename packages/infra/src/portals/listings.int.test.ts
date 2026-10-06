import {
  ConnectPortalAccount,
  RequestPublication,
  SetPortalAccountEnabled,
  SyncListing,
} from '@norde/core/portals';
import {
  FakeListingSourceReader,
  FakePortalAuthorizer,
  FakePortalConnector,
  LISTED_PROPERTY_ID,
  listingSource,
} from '@norde/core/portals/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock, unwrap } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { AesGcmSecretCipher } from '../adapters/crypto/aes-gcm-secret-cipher';
import { MercadoLibreAuthorizer } from '../adapters/portals/mercadolibre/mercadolibre-authorizer';
import { auditLog, outbox, portalListings } from '../db/schema';
import type { InfraLogger } from '../shared/logger';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleListingRepository } from './drizzle-listing-repository';
import { MercadoLibreTokens } from './mercadolibre-tokens';
import { createPortalsUnitOfWork } from './portals-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-06T12:00:00Z');
const cipher = new AesGcmSecretCipher(Buffer.alloc(32, 5).toString('base64')); // gitleaks:allow
const ADMIN = Actor.user('01920000-0000-7000-8000-0000000000ad', ['portals:*']);
const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const SALE = { propertyId: LISTED_PROPERTY_ID, operation: 'sale' } as const;
const silent: InfraLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function setup() {
  const uow = createPortalsUnitOfWork(db, { ids, clock, cipher });
  const authorizer = new FakePortalAuthorizer();
  unwrap(
    await new ConnectPortalAccount({ uow, authorizer, clock }).execute(
      {
        portal: 'mercadolibre',
        code: 'TG-code',
        state: 's',
        expectedState: 's',
        codeVerifier: 'v'.repeat(43),
      },
      ADMIN,
    ),
  );
  unwrap(
    await new SetPortalAccountEnabled({ uow }).execute(
      { portal: 'mercadolibre', enabled: true },
      ADMIN,
    ),
  );
  const reader = new FakeListingSourceReader();
  reader.sources.set(LISTED_PROPERTY_ID, listingSource());
  const connector = new FakePortalConnector();
  return {
    reader,
    connector,
    listings: new DrizzleListingRepository(db, clock),
    request: new RequestPublication({ uow, reader, connector, ids, clock }),
    sync: new SyncListing({ uow, reader, connector, clock }),
  };
}

describe('portal listings (Postgres)', () => {
  it('publishes, syncs and stores the listing with its outbox event and audit', async () => {
    const { request, sync, listings } = await setup();

    const { listingId } = unwrap(await request.execute(SALE, ADMIN));
    const events = await db.select().from(outbox).where(eq(outbox.aggregateId, listingId));
    expect(events.map((e) => e.eventType)).toEqual(['portals.listing_sync_requested']);

    expect(unwrap(await sync.execute({ listingId }, PORTAL_SYNC))).toBe('synced');

    const [row] = await db.select().from(portalListings).where(eq(portalListings.id, listingId));
    expect(row).toMatchObject({
      portal: 'mercadolibre',
      propertyId: LISTED_PROPERTY_ID,
      operation: 'sale',
      status: 'published',
      intent: 'active',
      externalId: 'MLA1',
      createdBy: ADMIN.id,
      updatedBy: 'system:portal-sync',
    });
    const found = await listings.findForProperty(LISTED_PROPERTY_ID);
    expect(found.map((l) => l.toSnapshot().externalId)).toEqual(['MLA1']);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, LISTED_PROPERTY_ID));
    expect(audits.map((a) => a.action)).toEqual([
      'property.portal_publish_requested',
      'property.portal_published',
    ]);
  });

  it('keeps one listing per portal, property and operation', async () => {
    const { request } = await setup();
    unwrap(await request.execute(SALE, ADMIN));
    const second = await request.execute(SALE, ADMIN);
    expect(second.isErr() && second.error.type).toBe('ListingAlreadyExists');
    const rows = await db.select().from(portalListings);
    expect(rows).toHaveLength(1);
  });

  it('serializes two syncs of the same listing: only one creates it in the portal', async () => {
    const { request, sync, connector } = await setup();
    const { listingId } = unwrap(await request.execute(SALE, ADMIN));

    const outcomes = await Promise.all([
      sync.execute({ listingId }, PORTAL_SYNC),
      sync.execute({ listingId }, PORTAL_SYNC),
    ]);

    expect(outcomes.map((o) => unwrap(o)).sort()).toEqual(['synced', 'unchanged']);
    expect(connector.calls.filter((c) => c.method === 'create')).toHaveLength(1);
  });
});

describe('MercadoLibreTokens (Postgres)', () => {
  async function connected(expiresAt: string) {
    const uow = createPortalsUnitOfWork(db, { ids, clock, cipher });
    const authorizer = new FakePortalAuthorizer();
    authorizer.grant = {
      ...authorizer.grant,
      credentials: {
        accessToken: 'APP_USR-old',
        refreshToken: 'TG-old',
        expiresAt: new Date(expiresAt),
      },
    };
    unwrap(
      await new ConnectPortalAccount({ uow, authorizer, clock }).execute(
        {
          portal: 'mercadolibre',
          code: 'TG-code',
          state: 's',
          expectedState: 's',
          codeVerifier: 'v'.repeat(43),
        },
        ADMIN,
      ),
    );
  }

  function tokens(responses: (() => Response)[]) {
    const refreshes: string[] = [];
    const fakeFetch: typeof fetch = (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      refreshes.push(new URLSearchParams(body).get('refresh_token') ?? '');
      const next = responses.shift();
      if (!next) throw new Error('Unexpected refresh');
      return Promise.resolve(next());
    };
    const authorizer = new MercadoLibreAuthorizer({
      app: { clientId: '1', clientSecret: 's', redirectUri: 'https://panel.test/cb' },
      clock,
      logger: silent,
      fetch: fakeFetch,
    });
    return {
      tokens: new MercadoLibreTokens({ db, cipher, authorizer, clock, logger: silent }),
      refreshes,
    };
  }

  it('uses the stored token while it is valid', async () => {
    await connected('2026-10-06T18:00:00Z');
    const { tokens: provider, refreshes } = tokens([]);
    expect(unwrap(await provider.accessToken('mercadolibre'))).toBe('APP_USR-old');
    expect(refreshes).toEqual([]);
  });

  it('refreshes once and stores the rotated refresh token, even with two jobs at once', async () => {
    await connected('2026-10-06T12:01:00Z');
    const rotated = {
      access_token: 'APP_USR-new',
      expires_in: 21600,
      user_id: 1,
      refresh_token: 'TG-new', // gitleaks:allow
    };
    const { tokens: provider, refreshes } = tokens([() => Response.json(rotated)]);

    const [first, second] = await Promise.all([
      provider.accessToken('mercadolibre'),
      provider.accessToken('mercadolibre'),
    ]);

    expect([unwrap(first), unwrap(second)]).toEqual(['APP_USR-new', 'APP_USR-new']);
    expect(refreshes).toEqual(['TG-old']);
  });

  it('asks to reconnect when MercadoLibre rejects the refresh token', async () => {
    await connected('2026-10-06T12:01:00Z');
    const { tokens: provider } = tokens([
      () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
    ]);
    const result = await provider.accessToken('mercadolibre');
    expect(result.isErr() && result.error.type).toBe('PortalCredentialsMissing');
  });
});
