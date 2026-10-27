import {
  Client,
  GetSharedListing,
  ListClientSends,
  OpenSharedListing,
  ReactToSharedListing,
  RevokeSharedListing,
  SendListings,
  type ClientListingSummary,
} from '@norde/core/clients';
import { CompanySettings } from '@norde/core/settings';
import { Actor, Email, ok, parseId, Phone } from '@norde/core/shared';
import { FixedClock, unwrap, unwrapErr } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { RandomSharedListingTokens } from '../adapters/crypto/random-shared-listing-tokens';
import { HtmlSharedListingEmails } from '../adapters/mail/html-shared-listing-emails';
import { auditLog, sharedListingItems, sharedListings } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientRepository } from './drizzle-client-repositories';
import { DrizzleClientSendsQuery } from './drizzle-client-sends-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T12:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const tokens = new RandomSharedListingTokens();

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000e2';
const NOW = new Date('2026-03-10T12:00:00Z');

const agent = Actor.user(AGENT, ['clients:read', 'clients:update', 'properties:read']).withBranch(
  BRANCH,
);
const web = Actor.system('web', ['clients:respond-to-listings']);

function listing(id: string): ClientListingSummary {
  return {
    id,
    code: `NOR-${id.slice(-3)}`,
    title: 'Departamento',
    address: undefined,
    status: 'available',
    operations: [],
    cover: undefined,
    producer: undefined,
  };
}

const listings = {
  summaries: (propertyIds: readonly string[]) =>
    Promise.resolve(new Map(propertyIds.map((id) => [id, listing(id)] as const))),
};
const agents = {
  names: () => Promise.resolve(new Map([[AGENT, 'Camila']])),
  find: () => Promise.resolve({ branchId: BRANCH }),
};
const sent: { to: string; html: string | undefined }[] = [];

const send = new SendListings({
  uow,
  listings,
  publicListings: { unlisted: () => Promise.resolve([]) },
  tokens,
  emails: new HtmlSharedListingEmails(),
  mailer: {
    send: (email) => {
      sent.push({ to: email.to, html: email.html });
      return Promise.resolve(ok(undefined));
    },
  },
  settings: { get: () => Promise.resolve(CompanySettings.defaults()) },
  agents,
  siteUrl: 'https://norde.com.ar',
  ids,
  clock,
});

async function seedClient(): Promise<string> {
  const id = parseId<'Client'>(ids.next());
  const phone = Phone.create('+5491166899124');
  const email = Email.create('ana@example.com');
  if (id.isErr() || phone.isErr() || email.isErr()) throw new Error('invalid fixture');
  const created = Client.create({
    id: id.value,
    kind: 'person',
    name: 'Ana',
    phones: [{ kind: 'mobile', phone: phone.value, contactHours: undefined }],
    emails: [{ kind: 'main', email: email.value }],
    clientTypes: [],
    agentId: AGENT,
    branchId: BRANCH,
    profile: {},
    now: NOW,
  });
  if (created.isErr()) throw new Error(created.error.type);
  await new DrizzleClientRepository(db, ids).save(created.value, AGENT);
  return id.value;
}

describe('shared listings', () => {
  it('stores a send with only the token hash, and follows its opens and reactions', async () => {
    const clientId = await seedClient();

    const output = unwrap(
      await send.execute(
        { clientId, propertyIds: [OTHER_PROPERTY, PROPERTY], channel: 'email' },
        agent,
      ),
    );
    const token = output.url.slice(output.url.lastIndexOf('/') + 1);

    expect(sent.map((email) => email.to)).toEqual(['ana@example.com']);
    expect(sent[0]?.html).toContain(output.url);
    const [row] = await db.select().from(sharedListings);
    expect(row).toMatchObject({ clientId, channel: 'email', tokenHash: tokens.hashOf(token) });
    expect(row?.tokenHash).not.toContain(token);

    const get = new GetSharedListing({ uow, tokens, agents, clock });
    expect(unwrap(await get.execute({ token }, web)).items.map((i) => i.propertyId)).toEqual([
      OTHER_PROPERTY,
      PROPERTY,
    ]);

    const deps = { uow, tokens, ids, clock };
    unwrap(await new OpenSharedListing(deps).execute({ token }, web));
    unwrap(await new OpenSharedListing(deps).execute({ token }, web));
    unwrap(
      await new ReactToSharedListing(deps).execute(
        { token, propertyId: PROPERTY, reaction: 'liked' },
        web,
      ),
    );

    expect(
      await db
        .select({
          propertyId: sharedListingItems.propertyId,
          openCount: sharedListingItems.openCount,
          reaction: sharedListingItems.reaction,
        })
        .from(sharedListingItems)
        .orderBy(sharedListingItems.position),
    ).toEqual([
      { propertyId: OTHER_PROPERTY, openCount: 2, reaction: null },
      { propertyId: PROPERTY, openCount: 2, reaction: 'liked' },
    ]);

    const list = new ListClientSends({
      uow,
      sends: new DrizzleClientSendsQuery(db),
      listings,
      agents,
      clock,
    });
    const page = unwrap(await list.execute({ clientId }, agent));
    expect(page.items).toMatchObject([
      {
        status: 'available',
        openCount: 2,
        firstOpenedAt: NOW,
        sentBy: { name: 'Camila' },
        properties: [
          { id: OTHER_PROPERTY, reaction: undefined },
          { id: PROPERTY, code: 'NOR-0e1', reaction: 'liked' },
        ],
        can: { revoke: true },
      },
    ]);

    unwrap(
      await new RevokeSharedListing({ uow, clock }).execute(
        { clientId, sharedListingId: output.sharedListingId },
        agent,
      ),
    );
    expect(unwrapErr(await get.execute({ token }, web))).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'revoked',
    });
    expect(
      (
        await db
          .select({ action: auditLog.action })
          .from(auditLog)
          .where(eq(auditLog.entityId, clientId))
      )
        .map((entry) => entry.action)
        .filter((action) => action !== 'client.created')
        .sort(),
    ).toEqual([
      'client.listing_reacted',
      'client.listing_send_opened',
      'client.listing_send_revoked',
      'client.listings_sent',
    ]);
  });

  it('pages the sends of a contact, newest first', async () => {
    const clientId = await seedClient();
    for (let day = 0; day < 3; day += 1) {
      unwrap(await send.execute({ clientId, propertyIds: [PROPERTY], channel: 'whatsapp' }, agent));
      clock.advance(24 * 60 * 60 * 1000);
    }
    const query = new DrizzleClientSendsQuery(db);

    const first = await query.sends({ clientId, direction: 'desc', offset: 0, limit: 2 });
    const second = await query.sends({ clientId, direction: 'desc', offset: 2, limit: 2 });

    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect((first.items[0]?.sentAt.getTime() ?? 0) > (first.items[1]?.sentAt.getTime() ?? 0)).toBe(
      true,
    );
  });
});
