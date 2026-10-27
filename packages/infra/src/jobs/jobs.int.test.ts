import { FixedClock } from '@norde/core/shared/testing';
import { sql } from 'drizzle-orm';
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
  it('applies the current options to a queue that already exists', async () => {
    // Una cola por corrida: el esquema de pg-boss no se vacía entre tests.
    const eventType = `tests.queue_options_${new UuidV7IdGenerator().next().replaceAll('-', '')}`;
    async function startWith(options: { retryLimit?: number; expireInSeconds?: number }) {
      const bus = new PgBossEventBus({
        connectionString: inject('databaseUrl'),
        logger: silent,
        applicationName: 'norde-infra-tests',
        schema: 'pgboss_test',
        ...(options.retryLimit === undefined ? {} : { retryLimit: options.retryLimit }),
      });
      bus.subscribe({
        eventType,
        name: 'handler',
        handle: () => Promise.resolve(),
        ...(options.expireInSeconds === undefined
          ? {}
          : { expireInSeconds: options.expireInSeconds }),
      });
      await bus.start();
      await bus.stop();
      const result = await db.execute<{ retry_limit: number; expire_seconds: number }>(
        sql`select retry_limit, expire_seconds from pgboss_test.queue where name = ${`${eventType}.handler`}`,
      );
      return result.rows[0];
    }

    expect(await startWith({ expireInSeconds: 600 })).toEqual({
      retry_limit: 5,
      expire_seconds: 600,
    });
    expect(await startWith({ retryLimit: 3, expireInSeconds: 1800 })).toEqual({
      retry_limit: 3,
      expire_seconds: 1800,
    });
    // Sin vencimiento propio vuelve al de pg-boss, no se queda con el anterior.
    expect(await startWith({})).toEqual({ retry_limit: 5, expire_seconds: 900 });
  });

  it('spaces the retries so a portal outage of minutes does not exhaust them', async () => {
    const eventType = `tests.queue_retry_${new UuidV7IdGenerator().next().replaceAll('-', '')}`;
    const bus = new PgBossEventBus({
      connectionString: inject('databaseUrl'),
      logger: silent,
      applicationName: 'norde-infra-tests',
      schema: 'pgboss_test',
    });
    bus.subscribe({ eventType, name: 'handler', handle: () => Promise.resolve() });
    await bus.start();
    await bus.stop();
    const result = await db.execute<{
      retry_backoff: boolean;
      retry_delay: number;
      retry_delay_max: number;
    }>(
      sql`select retry_backoff, retry_delay, retry_delay_max from pgboss_test.queue where name = ${`${eventType}.handler`}`,
    );
    expect(result.rows[0]).toEqual({ retry_backoff: true, retry_delay: 30, retry_delay_max: 600 });
  });

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
