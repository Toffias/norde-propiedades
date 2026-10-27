import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { FeaturedListing } from '../../domain/featured-listing';
import { SharedListing } from '../../domain/shared-listing';
import {
  FakeSharedListingTokens,
  InMemoryClientsUnitOfWork,
  OTHER_PROPERTY_ID,
  PROPERTY_ID,
  seedClient,
  seedSavedSearch,
  TEST_MANAGER,
} from '../../testing';

import { UnsubscribeFromFollowUps } from './unsubscribe-from-follow-ups';

const WEB = Actor.system('web', ['clients:respond-to-listings']);
const SEARCH_ID = '00000000-0000-7000-8000-0000000000b1';
const MANUAL_SEARCH_ID = '00000000-0000-7000-8000-0000000000b2';
const FEATURED_ID = '00000000-0000-7000-8000-0000000000d1';
const SEND_ID = '00000000-0000-7000-8000-0000000000f1';
const TOKEN = 'tok1'.padEnd(43, 'x');

function idOf<T extends string>(raw: string) {
  const id = parseId<T>(raw);
  if (id.isErr()) throw new Error(`ID de prueba inválido: ${raw}`);
  return id.value;
}

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const client = await seedClient(uow, { emails: ['ana@example.com'] });
  seedSavedSearch(uow, { id: SEARCH_ID, clientId: client.id, fields: { autoSend: true } });
  seedSavedSearch(uow, { id: MANUAL_SEARCH_ID, clientId: client.id });
  const featured = FeaturedListing.feature({
    id: idOf<'FeaturedListing'>(FEATURED_ID),
    clientId: client.id,
    propertyId: PROPERTY_ID,
    opportunityId: undefined,
    matchScore: undefined,
    by: TEST_MANAGER.id,
    now: new Date('2026-09-01T12:00:00Z'),
  });
  featured.setAutoSendUpdates(true, new Date('2026-09-01T12:00:00Z'));
  await uow.featured.save(featured);
  const tokens = new FakeSharedListingTokens();
  // Un envío viejo, ya vencido: el link de baja sirve igual.
  const sent = unwrap(
    SharedListing.send({
      id: idOf<'SharedListing'>(SEND_ID),
      tokenHash: tokens.hashOf(TOKEN),
      clientId: client.id,
      opportunityId: undefined,
      channel: 'email',
      propertyIds: [OTHER_PROPERTY_ID],
      by: 'system:scheduler',
      now: new Date('2026-01-01T12:00:00Z'),
    }),
  );
  await uow.sharedListings.save(sent);
  const clock = new FixedClock('2026-10-27T15:00:00Z');
  const unsubscribe = new UnsubscribeFromFollowUps({ uow, tokens, clock });
  return { uow, client, clock, unsubscribe };
}

describe('UnsubscribeFromFollowUps', () => {
  it('unsubscribes every search and turns off the featured auto-send', async () => {
    const { uow, client, clock, unsubscribe } = await setup();

    unwrap(await unsubscribe.execute({ token: TOKEN }, WEB));

    for (const id of [SEARCH_ID, MANUAL_SEARCH_ID]) {
      expect(uow.savedSearches.rows.get(id)).toMatchObject({
        autoSend: false,
        unsubscribedAt: clock.now(),
      });
    }
    expect(uow.featured.rows.get(FEATURED_ID)?.autoSendUpdates).toBe(false);
    expect(uow.audit.entries).toMatchObject([
      {
        action: 'client.follow_ups_unsubscribed',
        entityId: client.id,
        actorId: WEB.id,
        changes: {
          sharedListingId: { before: null, after: SEND_ID },
          savedSearchIds: {
            before: null,
            after: expect.arrayContaining([SEARCH_ID, MANUAL_SEARCH_ID]) as unknown,
          },
          featuredListingIds: { before: null, after: [FEATURED_ID] },
        },
      },
    ]);
  });

  it('does nothing the second time', async () => {
    const { uow, unsubscribe } = await setup();
    unwrap(await unsubscribe.execute({ token: TOKEN }, WEB));

    unwrap(await unsubscribe.execute({ token: TOKEN }, WEB));

    expect(uow.audit.entries).toHaveLength(1);
  });

  it('does not find an unknown or malformed token', async () => {
    const { uow, unsubscribe } = await setup();

    expect(unwrapErr(await unsubscribe.execute({ token: 'y'.repeat(43) }, WEB))).toEqual({
      type: 'SharedListingNotFound',
    });
    expect(unwrapErr(await unsubscribe.execute({ token: 'corto' }, WEB))).toEqual({
      type: 'SharedListingNotFound',
    });
    expect(uow.savedSearches.rows.get(SEARCH_ID)?.autoSend).toBe(true);
  });

  it('needs the permission of the public site', async () => {
    const { unsubscribe } = await setup();

    expect(unwrapErr(await unsubscribe.execute({ token: TOKEN }, Actor.system('web', [])))).toEqual(
      {
        type: 'Forbidden',
      },
    );
  });
});
