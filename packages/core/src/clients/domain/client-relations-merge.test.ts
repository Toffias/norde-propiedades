import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { Email } from '../../shared/domain/value-objects/email';
import { Phone } from '../../shared/domain/value-objects/phone';

import { Client, type ClientId } from './client';
import { MAX_CLIENT_RELATIONS, relationAllowed } from './client-relation';
import { ClientTag, ClientTagGroup } from './client-tag';

const T0 = new Date('2026-03-01T10:00:00Z');
const T1 = new Date('2026-03-02T10:00:00Z');
const T2 = new Date('2026-03-03T10:00:00Z');

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

function aClient(n: number, overrides: Partial<Parameters<typeof Client.create>[0]> = {}): Client {
  const created = Client.create({
    id: id(n),
    kind: 'person',
    name: `Contacto ${n.toString()}`,
    phones: [
      {
        kind: 'mobile',
        phone: phone(`+54911668991${n.toString().padStart(2, '0')}`),
        contactHours: undefined,
      },
    ],
    emails: [],
    clientTypes: [],
    agentId: 'agent-1',
    branchId: 'branch-1',
    profile: {},
    now: T0,
    ...overrides,
  });
  if (created.isErr()) throw new Error('invalid test client');
  created.value.pullEvents();
  return created.value;
}

const ref = (client: Client) => ({ id: client.id, kind: client.kind, isDeleted: client.isDeleted });

describe('Client tags', () => {
  it('replaces the tags without repeating them and reports when nothing changed', () => {
    const client = aClient(1);

    expect(client.changeTags(['t1', 't2', 't1'], T1).unwrapOr(false)).toBe(true);
    expect(client.tagIds).toEqual(['t1', 't2']);
    expect(client.changeTags(['t2', 't1'], T2).unwrapOr(true)).toBe(false);
    expect(client.toSnapshot().updatedAt).toEqual(T1);
  });

  it('does not change the tags of a contact in the trash', () => {
    const client = aClient(1);
    client.delete('agent-1', T1);

    expect(client.changeTags(['t1'], T2).isErr()).toBe(true);
  });
});

describe('Client relations', () => {
  it('allows only relations that make sense between the kinds of record', () => {
    expect(relationAllowed('works_at', 'person', 'company')).toBe(true);
    expect(relationAllowed('works_at', 'company', 'company')).toBe(false);
    expect(relationAllowed('works_at', 'person', 'group')).toBe(false);
    expect(relationAllowed('member_of', 'person', 'group')).toBe(true);
    expect(relationAllowed('member_of', 'company', 'group')).toBe(true);
    expect(relationAllowed('member_of', 'group', 'group')).toBe(false);
    expect(relationAllowed('related', 'group', 'person')).toBe(true);
  });

  it('links a person to a company and only updates the label when linked again', () => {
    const person = aClient(1);
    const company = aClient(2, { kind: 'company', name: 'Acme' });

    expect(person.link(ref(company), 'works_at', '  Gerente  ', T1).unwrapOr(false)).toBe(true);
    expect(person.relations).toEqual([
      { relatedClientId: company.id, kind: 'works_at', label: 'Gerente' },
    ]);
    expect(person.link(ref(company), 'works_at', 'Gerente', T2).unwrapOr(true)).toBe(false);
    expect(person.link(ref(company), 'works_at', 'Dueño', T2).unwrapOr(false)).toBe(true);
    expect(person.relations).toHaveLength(1);
    expect(person.relations[0]?.label).toBe('Dueño');
  });

  it('rejects relations with itself, between wrong kinds, with deleted contacts and over the limit', () => {
    const person = aClient(1);
    const other = aClient(2);
    const trashed = aClient(3);
    trashed.delete('agent-1', T1);

    expect(person.link(ref(person), 'related', undefined, T1)).toMatchObject({
      error: { type: 'SelfRelation' },
    });
    expect(person.link(ref(other), 'works_at', undefined, T1)).toMatchObject({
      error: { type: 'InvalidRelation' },
    });
    expect(person.link(ref(trashed), 'related', undefined, T1)).toMatchObject({
      error: { type: 'ClientInTrash' },
    });

    for (let n = 0; n < MAX_CLIENT_RELATIONS; n += 1) {
      person.link(
        { id: `other-${n.toString()}`, kind: 'person', isDeleted: false },
        'related',
        undefined,
        T1,
      );
    }
    expect(person.link(ref(other), 'related', undefined, T1)).toMatchObject({
      error: { type: 'TooManyRelations' },
    });
  });

  it('unlinks a relation', () => {
    const person = aClient(1);
    const group = aClient(2, { kind: 'group', name: 'Familia Pérez' });
    person.link(ref(group), 'member_of', undefined, T1);

    expect(person.unlink(group.id, 'related', T2).unwrapOr(true)).toBe(false);
    expect(person.unlink(group.id, 'member_of', T2).unwrapOr(false)).toBe(true);
    expect(person.relations).toEqual([]);
  });
});

describe('Client.absorb (unificar contactos)', () => {
  function duplicatePair() {
    const company = aClient(10, { kind: 'company', name: 'Acme' });
    const group = aClient(11, { kind: 'group', name: 'Colegas' });
    const primary = aClient(1, {
      name: 'Ana Pérez',
      emails: [{ kind: 'main', email: email('ana@mail.com') }],
      clientTypes: ['buyer'],
      profile: { companyName: 'Acme', birthDate: undefined },
      now: T1,
    });
    primary.changeTags(['t1', 't2'], T1);
    primary.link(ref(company), 'works_at', 'Gerente', T1);
    primary.recordContact('whatsapp', '5491166899101', T1);

    const duplicate = aClient(2, {
      name: 'Ana P.',
      phones: [
        { kind: 'mobile', phone: phone('+5491166899101'), contactHours: undefined },
        { kind: 'work', phone: phone('+541147770000'), contactHours: 'de 9 a 13' },
      ],
      emails: [{ kind: 'work', email: email('ana@acme.com') }],
      clientTypes: ['owner_seller'],
      agentId: 'agent-2',
      branchId: 'branch-2',
      profile: { birthDate: '1980-05-01', companyName: 'Otra' },
      now: T0,
    });
    duplicate.changeTags(['t2', 't3'], T1);
    duplicate.link(ref(company), 'works_at', 'Socia', T1);
    duplicate.link(ref(group), 'member_of', undefined, T1);
    duplicate.link(ref(primary), 'related', 'Misma persona', T1);
    duplicate.recordContact('whatsapp', '5491166899101', T0);
    duplicate.recordContact('zonaprop', 'zp-1', T0);
    primary.pullEvents();
    duplicate.pullEvents();
    return { primary, duplicate, company, group };
  }

  it('loses no phone, email, channel, type, tag or relation of the duplicate', () => {
    const { primary, duplicate, company, group } = duplicatePair();

    expect(primary.absorb(duplicate, 'agent-1', T2).isOk()).toBe(true);

    const merged = primary.toSnapshot();
    // El principal manda: su teléfono y su email siguen siendo los principales.
    expect(merged.phones.map((p) => p.phone.e164)).toEqual(['+5491166899101', '+541147770000']);
    expect(merged.phones[1]?.contactHours).toBe('de 9 a 13');
    expect(merged.emails.map((e) => e.email.value)).toEqual(['ana@mail.com', 'ana@acme.com']);
    expect(merged.channels.map((c) => [c.channel, c.externalId])).toEqual([
      ['whatsapp', '5491166899101'],
      ['zonaprop', 'zp-1'],
    ]);
    // El canal compartido conserva el primer contacto más viejo.
    expect(merged.channels[0]?.firstContactAt).toEqual(T0);
    expect(merged.clientTypes).toEqual(['buyer', 'owner_seller']);
    expect(merged.tagIds).toEqual(['t1', 't2', 't3']);
    expect(merged.relations).toEqual([
      { relatedClientId: company.id, kind: 'works_at', label: 'Gerente' },
      { relatedClientId: group.id, kind: 'member_of', label: undefined },
    ]);
    expect(merged.name).toBe('Ana Pérez');
    expect(merged.agentId).toBe('agent-1');
    expect(merged.profile).toMatchObject({ companyName: 'Acme', birthDate: '1980-05-01' });
    expect(merged.createdAt).toEqual(T0);
  });

  it('leaves the duplicate empty in the trash pointing to the principal', () => {
    const { primary, duplicate } = duplicatePair();

    primary.absorb(duplicate, 'agent-1', T2);

    const emptied = duplicate.toSnapshot();
    expect(emptied).toMatchObject({
      phones: [],
      emails: [],
      channels: [],
      tagIds: [],
      relations: [],
      deletedAt: T2,
      deletedBy: 'agent-1',
      mergedIntoId: primary.id,
    });
    expect(duplicate.restoreFromTrash(T2)).toMatchObject({
      error: { type: 'ClientMerged', clientId: primary.id },
    });
    expect(primary.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'clients.clients_merged',
        payload: { clientId: primary.id, mergedClientId: duplicate.id },
      }),
    ]);
  });

  it('takes the agent of the duplicate when the principal has none', () => {
    const primary = aClient(1, { agentId: undefined, branchId: undefined });
    const duplicate = aClient(2, { agentId: 'agent-2', branchId: 'branch-2' });

    primary.absorb(duplicate, 'agent-1', T2);

    expect(primary.ownership).toEqual({ ownerId: 'agent-2', ownerBranchId: 'branch-2' });
  });

  it('does not merge a contact with itself or with one in the trash', () => {
    const primary = aClient(1);
    const trashed = aClient(2);
    trashed.delete('agent-1', T1);

    expect(primary.absorb(primary, 'agent-1', T2)).toMatchObject({ error: { type: 'SameClient' } });
    expect(primary.absorb(trashed, 'agent-1', T2)).toMatchObject({
      error: { type: 'ClientInTrash' },
    });
  });
});

describe('ClientTag and ClientTagGroup', () => {
  it('clean their names and move between groups', () => {
    const groupId = parseId<'ClientTagGroup'>('00000000-0000-7000-8000-0000000000a1').unwrapOr(
      undefined as never,
    );
    const group = ClientTagGroup.create({
      id: groupId,
      name: '  Origen   web ',
      position: 0,
      now: T0,
    });
    expect(group.name).toBe('Origen web');
    group.rename('Origen', T1);
    expect(group.toSnapshot()).toMatchObject({ name: 'Origen', updatedAt: T1 });

    const tag = ClientTag.create({
      id: parseId<'ClientTag'>('00000000-0000-7000-8000-0000000000a2').unwrapOr(undefined as never),
      groupId: undefined,
      name: ' Zonaprop ',
      now: T0,
    });
    tag.update({ name: 'Zonaprop', groupId }, T1);
    expect(tag.toSnapshot()).toMatchObject({ name: 'Zonaprop', groupId, updatedAt: T1 });
  });
});
