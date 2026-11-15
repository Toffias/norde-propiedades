import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import {
  InMemoryClientsUnitOfWork,
  InMemoryInquiryPropertyLookup,
  RecordingTeamNotifier,
} from '../../testing';
import { RegisterContact } from '../commands/register-contact';

import { NotifyTeamOfOpportunity } from './on-opportunity-activity';

const scheduler = Actor.system('scheduler', ['clients:read']);
const EVENT_ID = '00000000-0000-7000-8000-0000000000f1';

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const notifier = new RecordingTeamNotifier();
  const handler = new NotifyTeamOfOpportunity({ uow, notifier });
  const registered = await new RegisterContact({
    uow,
    properties: new InMemoryInquiryPropertyLookup(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock('2026-03-01T10:00:00Z'),
  }).execute(
    {
      channel: 'whatsapp',
      channelExternalId: '5491166899124',
      phone: '+5491166899124',
      name: 'Ana',
      opportunity: { type: 'rent', intent: 'visit', note: 'Quiere visitar el sábado' },
    },
    Actor.system('agent-ia', ['clients:create', 'inquiries:receive']),
  );
  if (registered.isErr()) throw new Error('setup failed');
  const [event] = uow.events.published.filter((e) => e.type === 'clients.opportunity_created');
  if (!event) throw new Error('setup failed');
  return { handler, notifier, event: { ...event, type: 'clients.opportunity_created' as const } };
}

describe('NotifyTeamOfOpportunity', () => {
  it('notifies the team with the client and opportunity data', async () => {
    const { handler, notifier, event } = await setup();

    const result = await handler.execute(
      {
        id: EVENT_ID,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: { opportunityId: event.aggregateId, clientId: '' },
      },
      scheduler,
    );

    expect(result.isOk()).toBe(true);
    expect(notifier.notifications).toEqual([
      expect.objectContaining({
        kind: 'new',
        clientName: 'Ana',
        phone: '+5491166899124',
        channel: 'whatsapp',
        type: 'rent',
        intent: 'visit',
        status: 'new',
        latestNote: 'Quiere visitar el sábado',
      }),
    ]);
  });

  it('marks follow-ups', async () => {
    const { handler, notifier, event } = await setup();

    await handler.execute(
      {
        id: EVENT_ID,
        type: 'clients.opportunity_request_added',
        occurredAt: event.occurredAt,
        payload: { opportunityId: event.aggregateId, clientId: '' },
      },
      scheduler,
    );

    expect(notifier.notifications[0]?.kind).toBe('follow_up');
  });

  it('does not notify twice when the queue delivers the same event again', async () => {
    const { handler, notifier, event } = await setup();
    const delivery = {
      id: EVENT_ID,
      type: event.type,
      occurredAt: event.occurredAt,
      payload: { opportunityId: event.aggregateId, clientId: '' },
    };

    expect((await handler.execute(delivery, scheduler)).isOk()).toBe(true);
    expect((await handler.execute(delivery, scheduler)).isOk()).toBe(true);
    await handler.execute({ ...delivery, id: '00000000-0000-7000-8000-0000000000f2' }, scheduler);

    expect(notifier.notifications).toHaveLength(2);
  });

  it('notifies again on a retry when the first attempt failed', async () => {
    const { handler, notifier, event } = await setup();
    const delivery = {
      id: EVENT_ID,
      type: event.type,
      occurredAt: event.occurredAt,
      payload: { opportunityId: event.aggregateId, clientId: '' },
    };
    notifier.failNext = true;

    await expect(handler.execute(delivery, scheduler)).rejects.toThrow();
    expect((await handler.execute(delivery, scheduler)).isOk()).toBe(true);

    expect(notifier.notifications).toHaveLength(1);
  });

  it('fails with OpportunityNotFound for unknown opportunities', async () => {
    const { handler, notifier, event } = await setup();

    for (const opportunityId of ['00000000-0000-7000-8000-999999999999', 'nope']) {
      const result = await handler.execute(
        {
          id: EVENT_ID,
          type: event.type,
          occurredAt: event.occurredAt,
          payload: { opportunityId, clientId: '' },
        },
        scheduler,
      );
      expect(result.isErr() && result.error).toEqual({ type: 'OpportunityNotFound' });
    }
    expect(notifier.notifications).toEqual([]);
  });

  it('requires clients:read', async () => {
    const { handler, event } = await setup();

    const result = await handler.execute(
      {
        id: EVENT_ID,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: { opportunityId: event.aggregateId, clientId: '' },
      },
      Actor.system('web', []),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
