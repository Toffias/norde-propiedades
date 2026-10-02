import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';

import type { ClientId } from './client';
import {
  conversationActivity,
  inquiryActivity,
  inquiryActorId,
  MAX_NOTE_LENGTH,
  mergeActivity,
  noteActivity,
} from './client-activity';
import { FeaturedListing, propertiesToFeature } from './featured-listing';
import type { OpportunityId, OpportunitySnapshot } from './opportunity';

function id<T extends string>(raw: string) {
  const parsed = parseId<T>(raw);
  if (parsed.isErr()) throw new Error('Invalid test id');
  return parsed.value;
}

const CLIENT: ClientId = id('00000000-0000-7000-8000-0000000000d1');
const NOW = new Date('2026-03-10T12:00:00Z');
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000e2';

function anOpportunity(overrides: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
  return {
    id: id<'Opportunity'>('00000000-0000-7000-8000-0000000000f1') satisfies OpportunityId,
    clientId: CLIENT,
    originChannel: 'whatsapp',
    type: 'sale',
    intent: 'visit',
    status: 'new',
    propertyId: PROPERTY,
    search: undefined,
    notes: [
      { text: 'Busca 3 ambientes', createdAt: NOW },
      { text: 'Quiere visitar el sábado', createdAt: NOW },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('noteActivity', () => {
  it('trims the note and keeps who wrote it', () => {
    const note = noteActivity({
      id: 'a1',
      clientId: CLIENT,
      text: '  Llamé, vuelve a llamar el lunes\r\n ',
      actorId: 'u1',
      now: NOW,
    });

    expect(note.isOk() && note.value).toEqual({
      id: 'a1',
      clientId: CLIENT,
      opportunityId: undefined,
      actorId: 'u1',
      body: { kind: 'note', text: 'Llamé, vuelve a llamar el lunes' },
      occurredAt: NOW,
    });
  });

  it('rejects an empty note and one that is too long', () => {
    const base = { id: 'a1', clientId: CLIENT, actorId: 'u1', now: NOW };

    const empty = noteActivity({ ...base, text: '   ' });
    const long = noteActivity({ ...base, text: 'x'.repeat(MAX_NOTE_LENGTH + 1) });

    expect(empty.isErr() && empty.error).toEqual({ type: 'EmptyNote' });
    expect(long.isErr() && long.error).toEqual({ type: 'NoteTooLong', max: MAX_NOTE_LENGTH });
  });
});

describe('event activities', () => {
  it('records an inquiry with the latest request, by the agent on its channels', () => {
    const activity = inquiryActivity({
      id: 'e1',
      opportunity: anOpportunity(),
      followUp: true,
      occurredAt: NOW,
    });

    expect(activity).toMatchObject({
      clientId: CLIENT,
      opportunityId: '00000000-0000-7000-8000-0000000000f1',
      actorId: 'system:agent-ia',
      body: {
        kind: 'inquiry',
        channel: 'whatsapp',
        type: 'sale',
        intent: 'visit',
        propertyId: PROPERTY,
        followUp: true,
        note: 'Quiere visitar el sábado',
      },
    });
    expect(inquiryActorId('zonaprop')).toBe('system:portal-sync');
    expect(inquiryActorId('web_chat')).toBe('system:agent-ia');
  });

  it('records a conversation of the agent and a merge', () => {
    expect(
      conversationActivity({
        id: 'e2',
        clientId: CLIENT,
        conversationId: 'c1',
        channel: 'whatsapp',
        occurredAt: NOW,
      }).body,
    ).toEqual({ kind: 'message', conversationId: 'c1', channel: 'whatsapp' });
    expect(
      mergeActivity({ id: 'e3', clientId: CLIENT, mergedClientId: 'd2', actorId: 'u1', now: NOW })
        .body,
    ).toEqual({ kind: 'merge', mergedClientId: 'd2' });
  });
});

describe('FeaturedListing', () => {
  const feature = (propertyId: string) =>
    FeaturedListing.feature({
      id: id('00000000-0000-7000-8000-0000000000a1'),
      clientId: CLIENT,
      propertyId,
      by: 'u1',
      now: NOW,
    });

  it('features a property once per client', () => {
    const active = [feature(PROPERTY)];

    expect(
      propertiesToFeature([PROPERTY.toUpperCase(), OTHER_PROPERTY, OTHER_PROPERTY], active),
    ).toEqual([OTHER_PROPERTY]);
  });

  it('removes it once, keeping it as removed', () => {
    const listing = feature(PROPERTY);
    const later = new Date('2026-03-11T12:00:00Z');

    expect(listing.remove(later)).toBe(true);
    expect(listing.remove(later)).toBe(false);
    expect(listing.toSnapshot()).toMatchObject({ removedAt: later, featuredAt: NOW });
    expect(propertiesToFeature([PROPERTY], [listing])).toEqual([PROPERTY]);
  });
});
