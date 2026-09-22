import { FixedClock } from '@norde/core/shared/testing';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { outbox } from '../db/schema';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { OutboxRelay } from './outbox-relay';
import { PgBossEventBus } from './pg-boss-event-bus';
import type { PublishedEvent } from './published-event';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function recordEvents(count: number) {
  const publisher = new DrizzleOutboxPublisher(db, new UuidV7IdGenerator(), clock);
  await publisher.publish(
    Array.from({ length: count }, (_, i) => ({
      type: 'clients.opportunity_created',
      aggregateId: `agg-${i}`,
      occurredAt: clock.now(),
      payload: { opportunityId: `opp-${i}`, cents: 150n },
    })),
  );
}

describe('OutboxRelay', () => {
  it('publishes pending events in order and marks them as published', async () => {
    await recordEvents(3);
    const published: PublishedEvent[] = [];
    const relay = new OutboxRelay({
      db,
      logger: silent,
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    });

    expect(await relay.relayOnce()).toBe(3);
    expect(await relay.relayOnce()).toBe(0);
    expect(published.map((e) => e.aggregateId)).toEqual(['agg-0', 'agg-1', 'agg-2']);
    expect(published[0]?.payload).toEqual({ opportunityId: 'opp-0', cents: 150n });
    expect(published[0]?.occurredAt).toEqual(clock.now());
  });

  it('keeps failed events pending and counts the attempts', async () => {
    await recordEvents(1);
    const relay = new OutboxRelay({
      db,
      logger: silent,
      maxAttempts: 2,
      publish: () => Promise.reject(new Error('queue down')),
    });

    await relay.relayOnce();
    await relay.relayOnce();
    await relay.relayOnce();

    const [row] = await db.select().from(outbox);
    expect(row).toMatchObject({ publishedAt: null, attempts: 2, lastError: 'queue down' });
  });
});

describe('PgBossEventBus', () => {
  it('delivers an event once to each subscriber, even if published twice', async () => {
    const received: string[] = [];
    const bus = new PgBossEventBus({
      connectionString: inject('databaseUrl'),
      logger: silent,
      applicationName: 'norde-infra-tests',
      schema: 'pgboss_test',
    });
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => (resolveDone = resolve));
    for (const name of ['notify-team', 'audit-trail']) {
      bus.subscribe({
        eventType: 'clients.opportunity_created',
        name,
        handle: (event) => {
          received.push(`${name}:${event.aggregateId}`);
          if (received.length === 2) resolveDone();
          return Promise.resolve();
        },
      });
    }
    await bus.start();

    const event: PublishedEvent = {
      id: new UuidV7IdGenerator().next(),
      type: 'clients.opportunity_created',
      aggregateId: 'agg-1',
      occurredAt: clock.now(),
      payload: {},
    };
    await bus.publish(event);
    await bus.publish(event);
    await Promise.race([done, new Promise((r) => setTimeout(r, 10_000))]);
    await new Promise((r) => setTimeout(r, 1500));
    await bus.stop();

    expect(received.sort()).toEqual(['audit-trail:agg-1', 'notify-team:agg-1']);
  });
});
