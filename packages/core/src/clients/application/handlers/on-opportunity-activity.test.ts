import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import { InMemoryClientsUnitOfWork, RecordingTeamNotifier } from '../../testing';
import { RegisterContact } from '../commands/register-contact';

import { NotifyTeamOfOpportunity } from './on-opportunity-activity';

const scheduler = Actor.system('scheduler', ['clients:read']);

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const notifier = new RecordingTeamNotifier();
  const handler = new NotifyTeamOfOpportunity({
    clients: uow.clients,
    opportunities: uow.opportunities,
    notifier,
  });
  const registered = await new RegisterContact({
    uow,
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
    Actor.system('agent-ia', ['clients:create']),
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
        type: 'clients.opportunity_request_added',
        occurredAt: event.occurredAt,
        payload: { opportunityId: event.aggregateId, clientId: '' },
      },
      scheduler,
    );

    expect(notifier.notifications[0]?.kind).toBe('follow_up');
  });

  it('fails with OpportunityNotFound for unknown opportunities', async () => {
    const { handler, notifier, event } = await setup();

    for (const opportunityId of ['00000000-0000-7000-8000-999999999999', 'nope']) {
      const result = await handler.execute(
        {
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
        type: event.type,
        occurredAt: event.occurredAt,
        payload: { opportunityId: event.aggregateId, clientId: '' },
      },
      Actor.system('web', []),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
