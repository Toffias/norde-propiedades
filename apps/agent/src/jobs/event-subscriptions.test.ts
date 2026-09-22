import { err, ok, Actor } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { eventSubscriptions } from './event-subscriptions';

const actor = Actor.system('scheduler', ['clients:read']);
const event = {
  id: '00000000-0000-7000-8000-000000000001',
  type: 'clients.opportunity_created',
  occurredAt: new Date('2026-03-01T10:00:00Z'),
  payload: { opportunityId: 'opp-1', clientId: 'client-1' },
};

describe('eventSubscriptions', () => {
  it('notifies the team for new opportunities and follow-ups', async () => {
    const calls: unknown[] = [];
    const subscriptions = eventSubscriptions({
      notifyTeam: {
        execute: (input) => {
          calls.push(input);
          return Promise.resolve(ok(undefined));
        },
      },
      actor,
      logger: pino({ level: 'silent' }),
    });

    expect(subscriptions.map((s) => `${s.eventType}.${s.name}`)).toEqual([
      'clients.opportunity_created.notify-team',
      'clients.opportunity_request_added.notify-team',
    ]);
    await subscriptions[1]?.handle({ ...event, type: 'clients.opportunity_request_added' });
    expect(calls).toEqual([
      {
        type: 'clients.opportunity_request_added',
        occurredAt: event.occurredAt,
        payload: { opportunityId: 'opp-1', clientId: 'client-1' },
      },
    ]);
  });

  it('does not retry expected errors, and rejects malformed payloads', async () => {
    const [subscription] = eventSubscriptions({
      notifyTeam: { execute: () => Promise.resolve(err({ type: 'OpportunityNotFound' as const })) },
      actor,
      logger: pino({ level: 'silent' }),
    });

    await expect(subscription?.handle(event)).resolves.toBeUndefined();
    await expect(subscription?.handle({ ...event, payload: { nope: true } })).rejects.toThrow();
  });
});
