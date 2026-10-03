import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { PropertyInterestProfile } from '../../contracts';
import type {
  PropertyInterestCriteria,
  PropertyInterestQuery,
  PropertySendsCriteria,
} from '../ports/property-interest-query';
import { ListPropertyInterestedClients } from './list-property-interested-clients';
import { ListPropertySends } from './list-property-sends';

const PROPERTY = '00000000-0000-7000-8000-0000000000c1';
const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PROFILE: PropertyInterestProfile = {
  propertyId: PROPERTY,
  propertyType: 'apartment',
  operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
  locationIds: [],
  rooms: 3,
};

class StubInterestQuery implements PropertyInterestQuery {
  readonly interestCriteria: PropertyInterestCriteria[] = [];
  readonly sendCriteria: PropertySendsCriteria[] = [];

  interested(criteria: PropertyInterestCriteria) {
    this.interestCriteria.push(criteria);
    return Promise.resolve({
      items: [
        {
          clientId: 'c1',
          clientName: 'Ana Pérez',
          savedSearchId: 's1',
          savedSearchName: 'Depto Palermo',
          operation: 'sale',
          agentId: AGENT,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      total: 1,
    });
  }

  sends(criteria: PropertySendsCriteria) {
    this.sendCriteria.push(criteria);
    return Promise.resolve({
      items: [
        {
          sharedListingId: 'l1',
          clientId: 'c1',
          clientName: 'Ana Pérez',
          channel: 'whatsapp' as const,
          sentAt: new Date('2026-09-02T00:00:00Z'),
          sentBy: AGENT,
          openCount: 2,
          firstOpenedAt: new Date('2026-09-02T01:00:00Z'),
          reaction: 'liked' as const,
        },
      ],
      total: 1,
    });
  }
}

const agents = { names: () => Promise.resolve(new Map([[AGENT, 'Camila Ruiz']])) };
const profiles = {
  find: (propertyId: string) => Promise.resolve(propertyId === PROPERTY ? PROFILE : undefined),
  findMany: () => Promise.resolve(new Map()),
};

describe('ListPropertyInterestedClients', () => {
  it('lists the matching clients the actor can see, with the agent name', async () => {
    const interest = new StubInterestQuery();
    const actor = Actor.user(AGENT, ['clients:read', 'clients:read-branch']).withBranch(BRANCH);
    const page = unwrap(
      await new ListPropertyInterestedClients({ profiles, interest, agents }).execute(
        { propertyId: PROPERTY, page: 2, pageSize: 10 },
        actor,
      ),
    );
    expect(page.items[0]?.agent).toEqual({ id: AGENT, name: 'Camila Ruiz' });
    expect(interest.interestCriteria[0]).toEqual({
      profile: PROFILE,
      visibility: { kind: 'branch', ownerId: AGENT, branchId: BRANCH },
      offset: 10,
      limit: 10,
    });
  });

  it('needs to see clients and an existing property', async () => {
    const interest = new StubInterestQuery();
    const query = new ListPropertyInterestedClients({ profiles, interest, agents });
    expect(
      unwrapErr(
        await query.execute({ propertyId: PROPERTY }, Actor.user(AGENT, ['properties:read'])),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await query.execute(
          { propertyId: '00000000-0000-7000-8000-0000000000ff' },
          Actor.user(AGENT, ['clients:read-all']),
        ),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
  });
});

describe('ListPropertySends', () => {
  it('lists the sends with who sent them, within what the actor can see', async () => {
    const interest = new StubInterestQuery();
    const page = unwrap(
      await new ListPropertySends({ interest, agents }).execute(
        { propertyId: PROPERTY },
        Actor.user(AGENT, ['clients:read']),
      ),
    );
    expect(page.items[0]).toMatchObject({
      channel: 'whatsapp',
      reaction: 'liked',
      sentBy: { id: AGENT, name: 'Camila Ruiz' },
    });
    expect(interest.sendCriteria[0]?.visibility).toEqual({ kind: 'own', ownerId: AGENT });
  });
});
