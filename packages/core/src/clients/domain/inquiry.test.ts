import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';
import { Phone } from '../../shared/domain/value-objects/phone';
import { unwrap, unwrapErr } from '../../shared/testing';

import { Inquiry, suggestedOpportunityType } from './inquiry';
import { inquiryAutoTags } from './inquiry-tags';

const NOW = new Date('2026-03-01T10:00:00Z');
const id = unwrap(parseId<'Inquiry'>('00000000-0000-7000-8000-0000000000f1'));

function receive(overrides: Partial<Parameters<typeof Inquiry.receive>[0]> = {}) {
  return Inquiry.receive({
    id,
    channel: 'zonaprop',
    externalId: 'ZP-123',
    receivedAt: new Date('2026-03-01T09:30:00Z'),
    name: 'Ana Pérez',
    phone: unwrap(Phone.create('11 6689-9124')),
    email: unwrap(Email.create('Ana@Example.com')),
    message: '¿Sigue disponible?',
    propertyId: '00000000-0000-7000-8000-0000000000E1',
    developmentId: undefined,
    branchId: undefined,
    autoTags: ['channel:zonaprop'],
    now: NOW,
    ...overrides,
  });
}

describe('Inquiry', () => {
  it('enters pending, with the sender normalized and an event', () => {
    const inquiry = unwrap(receive());

    expect(inquiry.toSnapshot()).toMatchObject({
      status: 'pending',
      receivedAt: new Date('2026-03-01T09:30:00Z'),
      sender: {
        name: 'Ana Pérez',
        email: 'ana@example.com',
        phoneE164: '+541166899124',
        phoneMatchKey: '+541166899124',
      },
      propertyId: '00000000-0000-7000-8000-0000000000e1',
      deletedAt: undefined,
    });
    expect(inquiry.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'clients.inquiry_received',
        payload: {
          inquiryId: id,
          channel: 'zonaprop',
          propertyId: '00000000-0000-7000-8000-0000000000e1',
          developmentId: undefined,
        },
      }),
    ]);
  });

  it('needs a phone or an email', () => {
    expect(unwrapErr(receive({ phone: undefined, email: undefined }))).toEqual({
      type: 'MissingContactInfo',
    });
    unwrap(receive({ phone: undefined }));
    unwrap(receive({ email: undefined }));
  });

  it('takes a missing or future reception date as now', () => {
    expect(unwrap(receive({ receivedAt: undefined })).toSnapshot().receivedAt).toEqual(NOW);
    const future = new Date('2026-03-02T00:00:00Z');
    expect(unwrap(receive({ receivedAt: future })).toSnapshot().receivedAt).toEqual(NOW);
  });

  it('goes to the trash and comes back pending', () => {
    const inquiry = unwrap(receive());
    inquiry.pullEvents();

    unwrap(inquiry.delete('user-1', NOW));
    expect(inquiry.toSnapshot()).toMatchObject({
      status: 'deleted',
      deletedAt: NOW,
      deletedBy: 'user-1',
    });
    expect(unwrapErr(inquiry.delete('user-1', NOW))).toEqual({ type: 'InquiryAlreadyDeleted' });

    unwrap(inquiry.restoreFromTrash(NOW));
    expect(inquiry.toSnapshot()).toMatchObject({
      status: 'pending',
      deletedAt: undefined,
      deletedBy: undefined,
    });
    expect(unwrapErr(inquiry.restoreFromTrash(NOW))).toEqual({ type: 'InquiryNotDeleted' });
    expect(inquiry.pullEvents().map((e) => e.type)).toEqual([
      'clients.inquiry_deleted',
      'clients.inquiry_restored',
    ]);
  });

  it('comes back assigned if it already had a client', () => {
    const snapshot = unwrap(receive()).toSnapshot();
    const inquiry = Inquiry.restore({
      ...snapshot,
      status: 'deleted',
      clientId: '00000000-0000-7000-8000-0000000000c9',
      deletedAt: NOW,
      deletedBy: 'user-1',
    });

    unwrap(inquiry.restoreFromTrash(NOW));
    expect(inquiry.status).toBe('assigned');
  });
});

describe('Inquiry.assign', () => {
  const LATER = new Date('2026-03-01T11:00:00Z');
  const assignment = {
    clientId: '00000000-0000-7000-8000-0000000000c1',
    opportunityId: '00000000-0000-7000-8000-0000000000d1',
    agent: { agentId: 'agent-1', branchId: 'branch-agent' },
    by: 'user-1',
    now: LATER,
  };

  it('is assigned to the client, the opportunity and the agent, in the agent branch', () => {
    const inquiry = unwrap(receive({ branchId: 'branch-property' }));
    inquiry.pullEvents();

    unwrap(inquiry.assign(assignment));

    expect(inquiry.toSnapshot()).toMatchObject({
      status: 'assigned',
      clientId: assignment.clientId,
      opportunityId: assignment.opportunityId,
      assignedAgentId: 'agent-1',
      branchId: 'branch-agent',
      assignedAt: LATER,
      assignedBy: 'user-1',
      updatedAt: LATER,
    });
    expect(inquiry.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'clients.inquiry_assigned',
        payload: {
          inquiryId: id,
          clientId: assignment.clientId,
          opportunityId: assignment.opportunityId,
          agentId: 'agent-1',
        },
      }),
    ]);
  });

  it('keeps the property branch when nobody is in charge', () => {
    const inquiry = unwrap(receive({ branchId: 'branch-property' }));

    unwrap(inquiry.assign({ ...assignment, agent: { agentId: undefined, branchId: undefined } }));

    expect(inquiry.toSnapshot()).toMatchObject({
      assignedAgentId: undefined,
      branchId: 'branch-property',
    });
  });

  it('is assigned only once', () => {
    const inquiry = unwrap(receive());
    unwrap(inquiry.assign(assignment));

    expect(unwrapErr(inquiry.assign(assignment))).toEqual({ type: 'InquiryAlreadyAssigned' });
  });

  it('is not assigned from the trash', () => {
    const inquiry = unwrap(receive());
    unwrap(inquiry.delete('user-1', NOW));

    expect(unwrapErr(inquiry.assign(assignment))).toEqual({ type: 'InquiryInTrash' });
  });

  it('identifies the sender in the channel by email, or by phone without one', () => {
    expect(unwrap(receive()).senderChannelId).toBe('ana@example.com');
    expect(unwrap(receive({ email: undefined })).senderChannelId).toBe('+541166899124');
  });

  it('cuts the message to the opportunity note length', () => {
    const inquiry = unwrap(receive({ message: 'a'.repeat(2500) }));

    expect(inquiry.opportunityNote).toHaveLength(2000);
    expect(unwrap(receive({ message: undefined })).opportunityNote).toBeUndefined();
  });
});

describe('suggestedOpportunityType', () => {
  it('suggests rent only when the property is just for rent', () => {
    expect(suggestedOpportunityType(['channel:web', 'operation:rent'])).toBe('rent');
    expect(suggestedOpportunityType(['operation:temporary_rent', 'operation:rent'])).toBe('rent');
  });

  it('suggests sale otherwise, also without a property', () => {
    expect(suggestedOpportunityType(['operation:sale', 'operation:rent'])).toBe('sale');
    expect(suggestedOpportunityType(['channel:zonaprop'])).toBe('sale');
  });
});

describe('inquiryAutoTags', () => {
  it('tags the channel, and the operations, type and neighborhood of the property', () => {
    expect(
      inquiryAutoTags('zonaprop', {
        branchId: undefined,
        propertyType: 'apartment',
        operations: ['sale', 'rent', 'sale'],
        neighborhood: ' Palermo ',
      }),
    ).toEqual([
      'channel:zonaprop',
      'operation:sale',
      'operation:rent',
      'type:apartment',
      'neighborhood:Palermo',
    ]);
  });

  it('tags only the channel without a property or neighborhood', () => {
    expect(inquiryAutoTags('web_form', undefined)).toEqual(['channel:web_form']);
    expect(
      inquiryAutoTags('argenprop', {
        branchId: undefined,
        propertyType: 'house',
        operations: [],
        neighborhood: '',
      }),
    ).toEqual(['channel:argenprop', 'type:house']);
  });
});
