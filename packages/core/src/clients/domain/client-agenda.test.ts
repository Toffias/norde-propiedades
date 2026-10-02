import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';
import { Phone } from '../../shared/domain/value-objects/phone';

import { Client, type ClientId } from './client';
import { maskEmail, maskPhone } from './contact-masking';
import {
  contactConflicts,
  findExistingClient,
  normalizeName,
  possibleDuplicates,
} from './duplicate-check';

const T0 = new Date('2026-03-01T10:00:00Z');
const T1 = new Date('2026-03-02T10:00:00Z');

function id(n: number): ClientId {
  return parseId<'Client'>(`00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`).unwrapOr(
    undefined as never,
  );
}

function phone(raw: string): Phone {
  const created = Phone.create(raw);
  if (created.isErr()) throw new Error(`invalid test phone ${raw}`);
  return created.value;
}

function email(raw: string): Email {
  const created = Email.create(raw);
  if (created.isErr()) throw new Error(`invalid test email ${raw}`);
  return created.value;
}

function aClient(overrides: Partial<Parameters<typeof Client.create>[0]> = {}, n = 1): Client {
  const created = Client.create({
    id: id(n),
    kind: 'person',
    name: 'Ana Pérez',
    phones: [{ kind: 'mobile', phone: phone('+5491166899124'), contactHours: undefined }],
    emails: [{ kind: 'main', email: email('ana@mail.com') }],
    clientTypes: [],
    agentId: 'agent-1',
    branchId: 'branch-1',
    profile: {},
    now: T0,
    ...overrides,
  });
  if (created.isErr()) throw new Error('unexpected');
  return created.value;
}

describe('Client.create', () => {
  it('creates a manual contact and emits ClientRegistered from the office', () => {
    const client = aClient({ clientTypes: ['owner_seller', 'buyer', 'buyer'] });

    const s = client.toSnapshot();
    expect(s.clientTypes).toEqual(['buyer', 'owner_seller']);
    expect(s.channels).toEqual([]);
    expect(client.ownership).toEqual({ ownerId: 'agent-1', ownerBranchId: 'branch-1' });
    expect(client.isOwner).toBe(true);
    expect(client.pullEvents()).toEqual([
      {
        type: 'clients.client_registered',
        aggregateId: client.id,
        occurredAt: T0,
        payload: { clientId: client.id, channel: 'office' },
      },
    ]);
  });

  it('requires a name', () => {
    const result = Client.create({ ...baseInput(), name: '   ' });
    expect(result.isErr() && result.error).toEqual({ type: 'MissingName' });
  });

  it('requires a phone or an email', () => {
    const result = Client.create({ ...baseInput(), phones: [], emails: [] });
    expect(result.isErr() && result.error).toEqual({ type: 'MissingContactInfo' });
  });

  it('drops repeated phones (with or without the mobile 9) and emails', () => {
    const client = aClient({
      phones: [
        { kind: 'mobile', phone: phone('+5491166899124'), contactHours: ' de 9 a 13 ' },
        { kind: 'other', phone: phone('+541166899124'), contactHours: undefined },
      ],
      emails: [
        { kind: 'main', email: email('ana@mail.com') },
        { kind: 'work', email: email('ANA@mail.com') },
      ],
    });

    expect(client.phones).toHaveLength(1);
    expect(client.phones[0]?.contactHours).toBe('de 9 a 13');
    expect(client.emails).toHaveLength(1);
  });

  it('cleans empty profile fields', () => {
    const client = aClient({ profile: { companyName: '  ', jobTitle: ' Gerente ' } });
    expect(client.toSnapshot().profile).toMatchObject({
      companyName: undefined,
      jobTitle: 'Gerente',
    });
  });
});

function baseInput(): Parameters<typeof Client.create>[0] {
  return {
    id: id(1),
    kind: 'person',
    name: 'Ana',
    phones: [{ kind: 'main', phone: phone('+541147770000'), contactHours: undefined }],
    emails: [],
    clientTypes: [],
    agentId: undefined,
    branchId: undefined,
    profile: {},
    now: T0,
  };
}

describe('Client editing', () => {
  it('renames and reports whether something changed', () => {
    const client = aClient();
    expect(client.rename(' Ana Pérez ', T1).unwrapOr(true)).toBe(false);
    expect(client.rename('Ana María Pérez', T1).unwrapOr(false)).toBe(true);
    expect(client.toSnapshot()).toMatchObject({ name: 'Ana María Pérez', updatedAt: T1 });
    const empty = client.rename(' ', T1);
    expect(empty.isErr() && empty.error).toEqual({ type: 'MissingName' });
  });

  it('replaces phones and emails but never leaves the contact without both', () => {
    const client = aClient();
    const same = client.changeContactInfo({ phones: client.phones, emails: client.emails }, T1);
    expect(same.unwrapOr(true)).toBe(false);

    const changed = client.changeContactInfo(
      { phones: [], emails: [{ kind: 'work', email: email('ana@empresa.com') }] },
      T1,
    );
    expect(changed.unwrapOr(false)).toBe(true);
    expect(client.phone).toBeUndefined();
    expect(client.email?.value).toBe('ana@empresa.com');

    const empty = client.changeContactInfo({ phones: [], emails: [] }, T1);
    expect(empty.isErr() && empty.error).toEqual({ type: 'MissingContactInfo' });
  });

  it('changes types regardless of the order they were checked in', () => {
    const client = aClient({ clientTypes: ['tenant', 'buyer'] });
    expect(client.changeTypes(['buyer', 'tenant'], T1).unwrapOr(true)).toBe(false);
    expect(client.changeTypes(['investor'], T1).unwrapOr(false)).toBe(true);
    expect(client.isOwner).toBe(false);
  });

  it('updates only the profile fields that come', () => {
    const client = aClient({ profile: { companyName: 'Acme', country: 'Argentina' } });
    expect(client.updateDetails({ profile: { companyName: 'Acme' } }, T1).unwrapOr(true)).toBe(
      false,
    );
    expect(
      client.updateDetails({ kind: 'company', profile: { country: '' } }, T1).unwrapOr(false),
    ).toBe(true);
    expect(client.toSnapshot()).toMatchObject({
      kind: 'company',
      profile: { companyName: 'Acme', country: undefined },
    });
  });

  it('assigns an agent with its branch', () => {
    const client = aClient();
    expect(
      client.assignAgent({ agentId: 'agent-1', branchId: 'branch-1' }, T1).unwrapOr(true),
    ).toBe(false);
    expect(
      client.assignAgent({ agentId: 'agent-2', branchId: 'branch-2' }, T1).unwrapOr(false),
    ).toBe(true);
    expect(client.ownership).toEqual({ ownerId: 'agent-2', ownerBranchId: 'branch-2' });
  });
});

describe('Client trash', () => {
  it('goes to the trash and comes back, emitting events', () => {
    const client = aClient();
    client.pullEvents();

    expect(client.delete('agent-1', T1).isOk()).toBe(true);
    expect(client.toSnapshot()).toMatchObject({ deletedAt: T1, deletedBy: 'agent-1' });
    const again = client.delete('agent-1', T1);
    expect(again.isErr() && again.error).toEqual({ type: 'ClientAlreadyDeleted' });

    expect(client.restoreFromTrash(T1).isOk()).toBe(true);
    expect(client.isDeleted).toBe(false);
    const notDeleted = client.restoreFromTrash(T1);
    expect(notDeleted.isErr() && notDeleted.error).toEqual({ type: 'ClientNotDeleted' });

    expect(client.pullEvents().map((e) => e.type)).toEqual([
      'clients.client_deleted',
      'clients.client_restored',
    ]);
  });

  it('cannot be edited while in the trash', () => {
    const client = aClient();
    client.delete('agent-1', T1);

    const results = [
      client.rename('Otra', T1),
      client.changeTypes(['buyer'], T1),
      client.updateDetails({ kind: 'company' }, T1),
      client.assignAgent({ agentId: undefined, branchId: undefined }, T1),
      client.changeContactInfo({ phones: client.phones, emails: [] }, T1),
    ];
    for (const result of results) {
      expect(result.isErr() && result.error).toEqual({ type: 'ClientInTrash' });
    }
  });
});

describe('duplicate check', () => {
  const ana = aClient({}, 1);
  const trashedAna = aClient(
    {
      phones: [{ kind: 'mobile', phone: phone('+5491155550000'), contactHours: undefined }],
      emails: [{ kind: 'main', email: email('ana.vieja@mail.com') }],
    },
    2,
  );
  trashedAna.delete('agent-1', T1);

  it('finds the existing client by phone first, preferring the active one', () => {
    const contact = { phones: [phone('+541166899124')], emails: [email('ana.vieja@mail.com')] };
    expect(findExistingClient([trashedAna, ana], contact)?.id).toBe(ana.id);
  });

  it('finds a trashed client so it can be restored instead of duplicated', () => {
    const contact = { phones: [phone('+5491155550000')], emails: [] };
    expect(findExistingClient([trashedAna], contact)?.isDeleted).toBe(true);
  });

  it('finds nothing when no phone or email matches', () => {
    expect(
      findExistingClient([ana], { phones: [phone('+541147770000')], emails: [] }),
    ).toBeUndefined();
  });

  it('lists conflicts with other clients only', () => {
    const contact = { phones: ana.phones.map((p) => p.phone), emails: [] };
    expect(contactConflicts(ana, [ana], contact)).toEqual([]);
    expect(contactConflicts(trashedAna, [ana], contact).map((c) => c.id)).toEqual([ana.id]);
  });

  it('flags same name with other contact data as a possible duplicate', () => {
    const contact = { phones: [phone('+541147770000')], emails: [] };
    expect(possibleDuplicates('ana  perez', [ana], contact).map((c) => c.id)).toEqual([ana.id]);
    expect(
      possibleDuplicates('Ana Pérez', [ana], {
        phones: [],
        emails: ana.emails.map((e) => e.email),
      }),
    ).toEqual([]);
    expect(possibleDuplicates('Ana Pérez', [trashedAna], contact)).toEqual([]);
    expect(possibleDuplicates('  ', [ana], contact)).toEqual([]);
  });

  it('normalizes names without accents, case or extra spaces', () => {
    expect(normalizeName('  José   MARÍA ')).toBe('jose maria');
  });
});

describe('contact masking', () => {
  it('keeps the last digits of a phone and the initial of an email', () => {
    expect(maskPhone('+5491166899124')).toBe('+54 •••• 9124');
    expect(maskEmail('ana.perez@mail.com')).toBe('a•••@mail.com');
    expect(maskEmail('invalido')).toBe('•••');
  });
});

describe('Client.register', () => {
  it('stores a WhatsApp phone as a mobile', () => {
    const result = Client.register({
      id: id(9),
      phone: phone('+5491166899124'),
      channel: 'whatsapp',
      channelExternalId: '5491166899124',
      now: T0,
    });
    expect(result.isOk() && result.value.phones[0]?.kind).toBe('mobile');
  });

  it('completes a missing phone and email as the main ones', () => {
    const result = Client.register({
      id: id(9),
      email: email('ana@mail.com'),
      channel: 'web_form',
      channelExternalId: 'form-1',
      now: T0,
    });
    if (result.isErr()) throw new Error('unexpected');
    const client = result.value;
    client.completeProfile({ phone: phone('+541147770000'), email: email('otra@mail.com') });
    expect(client.phones.map((p) => p.kind)).toEqual(['main']);
    expect(client.email?.value).toBe('ana@mail.com');
  });
});
