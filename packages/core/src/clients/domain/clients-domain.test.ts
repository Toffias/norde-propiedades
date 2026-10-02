import { describe, expect, it } from 'vitest';

import type { Id } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';
import { Phone } from '../../shared/domain/value-objects/phone';

import { Client, type ClientId } from './client';
import { findOpenOpportunityAbout, Opportunity } from './opportunity';
import { canTransition, OPPORTUNITY_STATUSES } from './opportunity-status';

const T0 = new Date('2026-03-01T10:00:00Z');
const T1 = new Date('2026-03-02T10:00:00Z');
const CLIENT_ID = '00000000-0000-7000-8000-000000000001' as ClientId;
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000aa';
let opportunitySequence = 0;
const nextOpportunityId = () =>
  `00000000-0000-7000-8000-1${(opportunitySequence++).toString().padStart(11, '0')}` as Id<'Opportunity'>;
const CHANGE_ID = '00000000-0000-7000-8000-0000000000c1' as Id<'OpportunityStatusChange'>;
const NEW_STAGE = {
  id: '00000000-0000-7000-8000-0000000000b1' as Id<'OpportunityStage'>,
  category: 'new',
  isActive: true,
} as const;
const REFERRED_STAGE = {
  id: '00000000-0000-7000-8000-0000000000b7' as Id<'OpportunityStage'>,
  category: 'referred_to_partner',
  isActive: true,
} as const;

const phone = Phone.create('+5491166899124').unwrapOr(undefined as never);
const email = Email.create('ana@mail.com').unwrapOr(undefined as never);

function registeredClient(): Client {
  const result = Client.register({
    id: CLIENT_ID,
    name: ' Ana ',
    phone,
    channel: 'whatsapp',
    channelExternalId: '5491166899124',
    now: T0,
  });
  if (result.isErr()) throw new Error('unexpected');
  return result.value;
}

function openOpportunity(overrides: Partial<Parameters<typeof Opportunity.open>[0]> = {}) {
  return Opportunity.open({
    id: nextOpportunityId(),
    clientId: CLIENT_ID,
    originChannel: 'whatsapp',
    type: 'rent',
    intent: 'info',
    stage: NEW_STAGE,
    agent: { agentId: undefined, branchId: undefined },
    statusChangeId: CHANGE_ID,
    now: T0,
    ...overrides,
  });
}

describe('Client', () => {
  it('registers with a first channel and emits ClientRegistered', () => {
    const client = registeredClient();

    expect(client.name).toBe('Ana');
    expect(client.channels).toEqual([
      { channel: 'whatsapp', externalId: '5491166899124', firstContactAt: T0, lastContactAt: T0 },
    ]);
    expect(client.pullEvents().map((e) => e.type)).toEqual(['clients.client_registered']);
  });

  it('requires a phone or an email', () => {
    const result = Client.register({
      id: CLIENT_ID,
      name: 'Ana',
      channel: 'web_chat',
      channelExternalId: 'session-1',
      now: T0,
    });

    expect(result.isErr() && result.error).toEqual({ type: 'MissingContactInfo' });
  });

  it('touches a known channel without emitting events', () => {
    const client = registeredClient();
    client.pullEvents();

    client.recordContact('whatsapp', '5491166899124', T1);

    expect(client.channels).toHaveLength(1);
    expect(client.channels[0]).toMatchObject({ firstContactAt: T0, lastContactAt: T1 });
    expect(client.pullEvents()).toEqual([]);
  });

  it('adds a new channel and emits ClientChannelAdded', () => {
    const client = registeredClient();
    client.pullEvents();

    client.recordContact('zonaprop', 'lead-99', T1);

    expect(client.channels.map((c) => c.channel)).toEqual(['whatsapp', 'zonaprop']);
    expect(client.pullEvents().map((e) => e.type)).toEqual(['clients.client_channel_added']);
  });

  it('completes missing data without overwriting existing data', () => {
    const client = registeredClient();

    client.completeProfile({ name: 'Otra', email });

    expect(client.name).toBe('Ana');
    expect(client.email?.value).toBe('ana@mail.com');
  });
});

describe('Opportunity', () => {
  it('opens in the given stage and keeps its category as the status', () => {
    expect(openOpportunity().status).toBe('new');
    const referred = openOpportunity({ stage: REFERRED_STAGE });
    expect(referred.status).toBe('referred_to_partner');
    expect(referred.stageId).toBe(REFERRED_STAGE.id);
  });

  it('emits OpportunityCreated and keeps the first note', () => {
    const opportunity = openOpportunity({ note: ' Busca 2 ambientes ' });

    expect(opportunity.notes).toEqual([{ text: 'Busca 2 ambientes', createdAt: T0 }]);
    expect(opportunity.pullEvents().map((e) => e.type)).toEqual(['clients.opportunity_created']);
  });

  it('only raises the intent when a new request arrives', () => {
    const opportunity = openOpportunity({ intent: 'visit' });

    opportunity.addRequest({ intent: 'info', note: 'Pregunta por expensas', now: T1 });

    expect(opportunity.intent).toBe('visit');
    expect(opportunity.notes.map((n) => n.text)).toEqual(['Pregunta por expensas']);
    expect(opportunity.pullEvents().map((e) => e.type)).toContain(
      'clients.opportunity_request_added',
    );
  });

  it('treats won and lost as closed', () => {
    for (const status of OPPORTUNITY_STATUSES) {
      const open = status !== 'won' && status !== 'lost';
      expect(Opportunity.restore({ ...openOpportunity().toSnapshot(), status }).isOpen()).toBe(
        open,
      );
    }
    expect(canTransition('won', 'new')).toBe(false);
    expect(canTransition('referred_to_partner', 'new')).toBe(true);
  });
});

describe('findOpenOpportunityAbout', () => {
  it('finds an open opportunity with the same type and property', () => {
    const general = openOpportunity();
    const forProperty = openOpportunity({ propertyId: PROPERTY_ID });
    const closed = Opportunity.restore({ ...openOpportunity().toSnapshot(), status: 'lost' });

    expect(findOpenOpportunityAbout([closed, general, forProperty], { type: 'rent' })).toBe(
      general,
    );
    expect(
      findOpenOpportunityAbout([general, forProperty], { type: 'rent', propertyId: PROPERTY_ID }),
    ).toBe(forProperty);
    expect(findOpenOpportunityAbout([general], { type: 'sale' })).toBeUndefined();
    expect(findOpenOpportunityAbout([closed], { type: 'rent' })).toBeUndefined();
  });
});
