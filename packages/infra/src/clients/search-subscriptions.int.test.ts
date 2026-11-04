import {
  ConfirmSearchSubscription,
  PurgeExpiredSearchSubscriptions,
  RequestSearchSubscription,
} from '@norde/core/clients';
import { CompanySettings } from '@norde/core/settings';
import { Actor, Email, ok, parseId } from '@norde/core/shared';
import { FixedClock, unwrap } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { insertTestBranch, useTestDatabase } from '../../test/database';
import { HtmlSubscriptionConfirmationEmails } from '../adapters/mail/html-subscription-confirmation-emails';
import { clients, savedSearches, searchSubscriptions, users } from '../db/schema';
import { DrizzleDefaultAssignee } from '../identity/drizzle-default-assignee';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleSavedSearchRepository } from './drizzle-saved-search-repository';
import { DrizzleSearchSubscriptionRepository } from './drizzle-search-subscription-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const NOW = new Date('2026-11-04T15:00:00Z');
const HOUR = 60 * 60 * 1000;
const WEB = Actor.system('web', ['clients:subscribe-searches']);
const SCHEDULER = Actor.system('scheduler', ['clients:send-follow-ups']);
const stamps = {
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'system:import',
  updatedBy: 'system:import',
};

/** Tokens predecibles: el hash es el token, para leer el link del email. */
const tokens = (() => {
  let issued = 0;
  return {
    issue() {
      issued += 1;
      const token = `tok${issued.toString()}`.padEnd(43, 'x');
      return { token, hash: `hash:${token}` };
    },
    hashOf: (token: string) => `hash:${token}`,
  };
})();

async function aUser(
  email: string,
  overrides: { defaultAssignee?: boolean; status?: string } = {},
) {
  const id = ids.next();
  const branchId = await insertTestBranch(db);
  await db
    .insert(users)
    .values({ id, email, name: 'Usuario de prueba', branchId, ...overrides, ...stamps });
  return { id, branchId };
}

function setup(clock = new FixedClock(NOW)) {
  const uow = createClientsUnitOfWork(db, { ids, clock });
  const sent: { to: string; text: string }[] = [];
  const settings = { get: () => Promise.resolve(CompanySettings.defaults()) };
  const request = new RequestSearchSubscription({
    uow,
    tokens,
    emails: new HtmlSubscriptionConfirmationEmails(),
    mailer: {
      send: (email) => {
        sent.push({ to: email.to, text: email.text });
        return Promise.resolve(ok(undefined));
      },
    },
    settings,
    siteUrl: 'https://norde.com.ar',
    ids,
    clock,
  });
  const confirm = new ConfirmSearchSubscription({
    uow,
    tokens,
    assignee: new DrizzleDefaultAssignee(db),
    ids,
    clock,
  });
  const purge = new PurgeExpiredSearchSubscriptions({ uow, clock });
  return { sent, request, confirm, purge, clock };
}

function tokenIn(text: string): string {
  const match = /suscripcion\/([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error('El email no trae el link');
  return match[1];
}

const REQUEST = {
  name: 'Ana Pérez',
  email: 'ana@example.com',
  frequency: 'every_3_days' as const,
  summary: 'Departamentos en venta',
  operation: 'sale' as const,
  propertyTypes: ['apartment' as const],
  currency: 'USD' as const,
  maxPrice: '150000',
};

describe('search subscriptions (Drizzle)', () => {
  it('requests, confirms for the default advisor and keeps no personal data in the subscription', async () => {
    const camila = await aUser('camila@norde.com.ar', { defaultAssignee: true });
    const { sent, request, confirm } = setup();

    unwrap(await request.execute(REQUEST, WEB));
    const [pending] = await db.select().from(searchSubscriptions);
    expect(pending).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana Pérez',
      confirmedAt: null,
    });

    unwrap(await confirm.execute({ token: tokenIn(sent[0]?.text ?? '') }, WEB));

    const [client] = await db.select().from(clients);
    expect(client).toMatchObject({
      name: 'Ana Pérez',
      agentId: camila.id,
      branchId: camila.branchId,
    });
    const [search] = await db.select().from(savedSearches);
    expect(search).toMatchObject({
      clientId: client?.id,
      autoSend: true,
      frequency: 'every_3_days',
      maxPriceCents: 15_000_000n,
      createdBy: 'system:web',
    });
    const [confirmed] = await db.select().from(searchSubscriptions);
    expect(confirmed).toMatchObject({
      name: null,
      email: null,
      clientId: client?.id,
      savedSearchId: search?.id,
    });
    expect(confirmed?.confirmedAt).toEqual(NOW);
  });

  it('skips a suspended default advisor', async () => {
    await aUser('camila@norde.com.ar', { defaultAssignee: true, status: 'suspended' });
    const { sent, request, confirm } = setup();
    unwrap(await request.execute(REQUEST, WEB));

    unwrap(await confirm.execute({ token: tokenIn(sent[0]?.text ?? '') }, WEB));

    const [client] = await db.select().from(clients);
    expect(client?.agentId).toBeNull();
  });

  it('counts the requests of an email and purges the expired ones', async () => {
    const { request, purge, clock } = setup();
    unwrap(await request.execute(REQUEST, WEB));
    unwrap(await request.execute({ ...REQUEST, email: 'otro@example.com' }, WEB));
    const repository = new DrizzleSearchSubscriptionRepository(db);
    const email = unwrap(Email.create('ana@example.com'));

    expect(await repository.countRequestedSince(email, new Date(NOW.getTime() - HOUR))).toBe(1);
    expect(await repository.countRequestedSince(email, new Date(NOW.getTime() + HOUR))).toBe(0);

    clock.advance(73 * HOUR);
    expect(unwrap(await purge.execute(SCHEDULER))).toEqual({ deleted: 2 });
    expect(await db.select().from(searchSubscriptions)).toEqual([]);
  });

  it('marks the digest of searches without touching their edit date', async () => {
    const clientId = ids.next();
    await db.insert(clients).values({ id: clientId, name: 'Ana', ...stamps });
    const searchId = ids.next();
    await db.insert(savedSearches).values({ id: searchId, clientId, operation: 'sale', ...stamps });
    const later = new Date(NOW.getTime() + 24 * HOUR);

    await new DrizzleSavedSearchRepository(db).markDigestSent(
      [unwrap(parseId<'SavedSearch'>(searchId))],
      later,
    );

    const [row] = await db.select().from(savedSearches).where(eq(savedSearches.id, searchId));
    expect(row).toMatchObject({ lastDigestAt: later, updatedAt: NOW, frequency: 'daily' });
  });

  it('allows a single default advisor', async () => {
    await aUser('camila@norde.com.ar', { defaultAssignee: true });

    await expect(aUser('martin@norde.com.ar', { defaultAssignee: true })).rejects.toThrow();
  });
});
