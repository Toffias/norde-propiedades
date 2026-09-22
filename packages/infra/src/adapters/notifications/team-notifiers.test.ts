import type { OpportunityNotification } from '@norde/core/clients';
import { describe, expect, it } from 'vitest';

import { LogTeamNotifier, WebhookTeamNotifier } from './team-notifiers';

const notification: OpportunityNotification = {
  kind: 'new',
  opportunityId: 'opp-1',
  clientId: 'client-1',
  clientName: 'Ana',
  phone: '+5491166899124',
  email: 'ana@mail.com',
  channel: 'whatsapp',
  type: 'rent',
  intent: 'visit',
  status: 'new',
  propertyId: undefined,
  latestNote: 'Quiere visitar',
  occurredAt: new Date('2026-03-01T10:00:00Z'),
};

describe('WebhookTeamNotifier', () => {
  it('posts the notification as JSON with the bearer token', async () => {
    const requests: { body: unknown; auth: string | null }[] = [];
    const notifier = new WebhookTeamNotifier({
      url: 'https://hooks.example.com/norde',
      token: 'secret',
      fetch: (_url, init) => {
        requests.push({
          body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown,
          auth: new Headers(init?.headers).get('authorization'),
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    await notifier.notifyOpportunity(notification);

    expect(requests).toEqual([
      {
        auth: 'Bearer secret',
        body: expect.objectContaining({
          event: 'opportunity.created',
          opportunityId: 'opp-1',
          occurredAt: '2026-03-01T10:00:00.000Z',
        }) as unknown,
      },
    ]);
  });

  it('throws on an error response so the job is retried', async () => {
    const notifier = new WebhookTeamNotifier({
      url: 'https://hooks.example.com/norde',
      fetch: () => Promise.resolve(new Response(null, { status: 502 })),
    });

    await expect(notifier.notifyOpportunity(notification)).rejects.toThrow(/502/);
  });
});

describe('LogTeamNotifier', () => {
  it('logs the opportunity without personal data in clear text', async () => {
    const lines: unknown[] = [];
    const notifier = new LogTeamNotifier({
      info: (details) => lines.push(details),
      warn: () => undefined,
      error: () => undefined,
    });

    await notifier.notifyOpportunity(notification);

    const logged = JSON.stringify(lines);
    expect(logged).not.toContain('+5491166899124');
    expect(logged).not.toContain('ana@mail.com');
    expect(logged).toContain('opp-1');
  });
});
