import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  InMemoryClientsUnitOfWork,
  InMemoryInquiryPropertyLookup,
  PROPERTY_ID,
} from '../../testing';

import { DeleteInquiry } from './delete-inquiry';
import { ReceiveInquiry } from './receive-inquiry';
import { RestoreInquiry } from './restore-inquiry';

const WEB = Actor.system('web', ['inquiries:receive']);
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000c3', ['inquiries:manage']);
const READER = Actor.user('00000000-0000-7000-8000-0000000000c4', ['inquiries:read']);

const TAGS = ['channel:web_form', 'operation:sale', 'type:apartment', 'neighborhood:Palermo'];
const INPUT = {
  channel: 'web_form',
  externalId: '0199c3a0-0000-7000-8000-000000000001',
  name: 'Ana Pérez',
  phone: '+54 9 11 6689-9124',
  email: 'ana@example.com',
  message: 'Hola, ¿sigue disponible?',
  propertyId: PROPERTY_ID,
} as const;

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const properties = new InMemoryInquiryPropertyLookup();
  properties.known.set(PROPERTY_ID, {
    branchId: BRANCH_ID,
    propertyType: 'apartment',
    operations: ['sale'],
    neighborhood: 'Palermo',
  });
  return {
    uow,
    receive: new ReceiveInquiry({ uow, properties, ids, clock }),
    deleteInquiry: new DeleteInquiry({ uow, clock }),
    restoreInquiry: new RestoreInquiry({ uow, clock }),
  };
}

describe('ReceiveInquiry', () => {
  it('registers a pending inquiry with the branch and tags of the property', async () => {
    const { uow, receive } = setup();

    const { inquiryId, duplicate } = unwrap(await receive.execute(INPUT, WEB));

    expect(duplicate).toBe(false);
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      channel: 'web_form',
      status: 'pending',
      receivedAt: new Date('2026-03-01T10:00:00Z'),
      sender: { name: 'Ana Pérez', email: 'ana@example.com', phoneE164: '+5491166899124' },
      propertyId: PROPERTY_ID,
      branchId: BRANCH_ID,
      autoTags: TAGS,
    });
    expect(uow.inquiries.savedBy.get(inquiryId)).toBe('system:web');
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.inquiry_received']);
  });

  it('audits the reception without the personal data of the sender', async () => {
    const { uow, receive } = setup();

    const { inquiryId } = unwrap(await receive.execute(INPUT, WEB));

    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'inquiry.received',
        entityType: 'inquiry',
        entityId: inquiryId,
        actorId: 'system:web',
        source: 'web',
        clientIds: [],
        changes: {
          channel: { before: null, after: 'web_form' },
          externalId: { before: null, after: INPUT.externalId },
          receivedAt: { before: null, after: new Date('2026-03-01T10:00:00Z') },
          propertyId: { before: null, after: PROPERTY_ID },
          branchId: { before: null, after: BRANCH_ID },
          status: { before: null, after: 'pending' },
          autoTags: { before: null, after: TAGS },
        },
      }),
    ]);
    expect(JSON.stringify(uow.audit.entries)).not.toMatch(/ana|6689|Pérez/i);
  });

  it('is idempotent: the same channel and external id do not enter twice', async () => {
    const { uow, receive } = setup();

    const first = unwrap(await receive.execute(INPUT, WEB));
    const again = unwrap(await receive.execute({ ...INPUT, message: 'Otra vez' }, WEB));

    expect(again).toEqual({ inquiryId: first.inquiryId, duplicate: true });
    expect(uow.inquiries.rows.size).toBe(1);
    expect(uow.events.published).toHaveLength(1);
    expect(uow.audit.entries).toHaveLength(1);
    // El mismo ID externo en otro canal es otra consulta.
    unwrap(await receive.execute({ ...INPUT, channel: 'zonaprop' }, WEB));
    expect(uow.inquiries.rows.size).toBe(2);
  });

  it('returns the winner when another delivery enters at the same time', async () => {
    const { uow, receive } = setup();
    const winner = unwrap(await receive.execute(INPUT, WEB));
    const snapshot = uow.inquiries.rows.get(winner.inquiryId);
    if (!snapshot) throw new Error('missing inquiry');
    uow.inquiries.rows.clear();
    uow.events.published.splice(0);
    uow.audit.entries.splice(0);
    uow.inquiries.racedBy = snapshot;

    const result = unwrap(await receive.execute(INPUT, WEB));

    expect(result).toEqual({ inquiryId: winner.inquiryId, duplicate: true });
    expect(uow.inquiries.rows.size).toBe(1);
    expect(uow.events.published).toHaveLength(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('tags only the channel when the property is not in the portfolio', async () => {
    const { uow, receive } = setup();
    const unknown = '00000000-0000-7000-8000-0000000000e9';

    const { inquiryId } = unwrap(await receive.execute({ ...INPUT, propertyId: unknown }, WEB));

    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      propertyId: unknown,
      branchId: undefined,
      autoTags: ['channel:web_form'],
    });
  });

  it('reports invalid input, phone, email and a sender without contact data', async () => {
    const { uow, receive } = setup();

    expect(unwrapErr(await receive.execute({ ...INPUT, externalId: '' }, WEB)).type).toBe(
      'InvalidInput',
    );
    expect(unwrapErr(await receive.execute({ ...INPUT, phone: '123' }, WEB))).toEqual({
      type: 'InvalidPhone',
    });
    expect(unwrapErr(await receive.execute({ ...INPUT, email: 'ana@' }, WEB))).toEqual({
      type: 'InvalidEmail',
    });
    const anonymous = { channel: INPUT.channel, externalId: INPUT.externalId, name: INPUT.name };
    expect(unwrapErr(await receive.execute(anonymous, WEB))).toEqual({
      type: 'MissingContactInfo',
    });
    expect(uow.inquiries.rows.size).toBe(0);
  });

  it('only runs for system actors with inquiries:receive', async () => {
    const { receive } = setup();
    const user = Actor.user('00000000-0000-7000-8000-0000000000c3', ['inquiries:*']);

    expect(unwrapErr(await receive.execute(INPUT, user))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await receive.execute(INPUT, Actor.system('web', ['clients:create']))),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('DeleteInquiry and RestoreInquiry', () => {
  async function received() {
    const fixture = setup();
    const { inquiryId } = unwrap(await fixture.receive.execute(INPUT, WEB));
    fixture.uow.events.published.splice(0);
    fixture.uow.audit.entries.splice(0);
    return { ...fixture, inquiryId };
  }

  it('sends the inquiry to the trash and back, audited', async () => {
    const { uow, deleteInquiry, restoreInquiry, inquiryId } = await received();

    unwrap(await deleteInquiry.execute({ inquiryId }, MANAGER));
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      status: 'deleted',
      deletedAt: new Date('2026-03-01T10:00:00Z'),
      deletedBy: MANAGER.id,
    });

    unwrap(await restoreInquiry.execute({ inquiryId }, MANAGER));
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      status: 'pending',
      deletedAt: undefined,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.inquiry_deleted',
      'clients.inquiry_restored',
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({ kind: 'action', action: 'inquiry.deleted', entityId: inquiryId }),
      expect.objectContaining({ kind: 'action', action: 'inquiry.restored', entityId: inquiryId }),
    ]);
  });

  it('needs "Administrar consultas"', async () => {
    const { deleteInquiry, restoreInquiry, inquiryId } = await received();

    expect(unwrapErr(await deleteInquiry.execute({ inquiryId }, READER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await restoreInquiry.execute({ inquiryId }, READER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('reports a missing inquiry, invalid input and the wrong state', async () => {
    const { uow, deleteInquiry, restoreInquiry, inquiryId } = await received();
    const missing = '00000000-0000-7000-8000-0000000000f9';

    expect(unwrapErr(await deleteInquiry.execute({ inquiryId: missing }, MANAGER))).toEqual({
      type: 'InquiryNotFound',
    });
    expect(unwrapErr(await deleteInquiry.execute({ inquiryId: 'x' }, MANAGER)).type).toBe(
      'InvalidInput',
    );
    expect(unwrapErr(await restoreInquiry.execute({ inquiryId }, MANAGER))).toEqual({
      type: 'InquiryNotDeleted',
    });
    unwrap(await deleteInquiry.execute({ inquiryId }, MANAGER));
    expect(unwrapErr(await deleteInquiry.execute({ inquiryId }, MANAGER))).toEqual({
      type: 'InquiryAlreadyDeleted',
    });
    expect(uow.audit.entries).toHaveLength(1);
  });
});
