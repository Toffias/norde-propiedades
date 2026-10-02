import {
  ChangeClientTags,
  CreateClient,
  CreateClientTag,
  CreateClientTagGroup,
  LinkClients,
  MergeClients,
  MergeClientTags,
  RegisterContact,
} from '@norde/core/clients';
import { Actor, parseId } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import {
  auditLog,
  clientActivities,
  clientChannels,
  clientRelations,
  clients,
  clientTagAssignments,
  clientTags,
  featuredListings,
  inquiries,
  opportunities,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientListQuery } from './drizzle-client-list-query';
import { DrizzleClientRelationQuery } from './drizzle-client-relation-query';
import { DrizzleClientRepository } from './drizzle-client-repositories';
import { DrizzleClientTagQuery } from './drizzle-client-tag-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const repository = new DrizzleClientRepository(db, ids);
const tagQuery = new DrizzleClientTagQuery(db);
const relationQuery = new DrizzleClientRelationQuery(db);
const listQuery = new DrizzleClientListQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PROPERTY = '00000000-0000-7000-8000-0000000000d1';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000d2';
const NOW = new Date('2026-03-01T10:00:00Z');

const manager = Actor.user(AGENT, ['clients:*', 'tags:update', 'audit:*']).withBranch(BRANCH);
const agents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: () => Promise.resolve({ branchId: BRANCH }),
};

async function createClient(
  name: string,
  phone: string,
  extra: { kind?: 'person' | 'company' | 'group'; email?: string } = {},
): Promise<string> {
  const result = await new CreateClient({ uow, agents, ids, clock }).execute(
    {
      name,
      kind: extra.kind ?? 'person',
      phones: [{ kind: 'mobile', number: phone }],
      emails: extra.email === undefined ? [] : [{ kind: 'main', address: extra.email }],
    },
    manager,
  );
  if (result.isErr()) throw new Error(result.error.type);
  return result.value.clientId;
}

async function createTag(name: string, groupId?: string): Promise<string> {
  const result = await new CreateClientTag({ uow, ids, clock }).execute(
    groupId === undefined ? { name } : { name, groupId },
    manager,
  );
  if (result.isErr()) throw new Error(result.error.type);
  return result.value.tagId;
}

async function tagClient(clientId: string, tagIds: string[]): Promise<void> {
  const result = await new ChangeClientTags({ uow, clock }).execute({ clientId, tagIds }, manager);
  if (result.isErr()) throw new Error(result.error.type);
}

function clientId(raw: string) {
  return parseId<'Client'>(raw).unwrapOr(undefined as never);
}

const authored = { createdAt: NOW, updatedAt: NOW, createdBy: AGENT, updatedBy: AGENT };

describe('client tags (Postgres)', () => {
  it('saves the tags of a contact and counts active contacts per tag and group', async () => {
    const group = await new CreateClientTagGroup({ uow, ids, clock }).execute(
      { name: 'Origen' },
      manager,
    );
    if (group.isErr()) throw new Error(group.error.type);
    const { groupId } = group.value;
    const zonaprop = await createTag('Zonaprop', groupId);
    const web = await createTag('Web', groupId);
    const loose = await createTag('Colega');
    const ana = await createClient('Ana', '+5491166899101');
    const bruno = await createClient('Bruno', '+5491166899102');
    await tagClient(ana, [zonaprop, web]);
    await tagClient(bruno, [zonaprop]);

    const loaded = await repository.findById(clientId(ana));
    expect([...(loaded?.tagIds ?? [])].sort()).toEqual([zonaprop, web].sort());

    // Quitar una conserva la autoría de la que queda.
    await tagClient(ana, [zonaprop]);
    expect(
      await db
        .select({ tagId: clientTagAssignments.tagId })
        .from(clientTagAssignments)
        .where(eq(clientTagAssignments.clientId, ana)),
    ).toEqual([{ tagId: zonaprop }]);

    const groups = await tagQuery.listGroups({
      text: 'orig',
      sort: { field: 'position', direction: 'asc' },
      offset: 0,
      limit: 10,
    });
    expect(groups.items).toEqual([
      { id: groupId, name: 'Origen', position: 0, tagCount: 2, clientCount: 2 },
    ]);
    const tags = await tagQuery.searchTags({
      text: undefined,
      groupId: undefined,
      direction: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(tags.items.map((t) => [t.name, t.groupName, t.clients])).toEqual([
      ['Colega', undefined, 0],
      ['Web', 'Origen', 0],
      ['Zonaprop', 'Origen', 2],
    ]);
    expect(
      (
        await tagQuery.searchTags({
          text: undefined,
          groupId: null,
          direction: 'asc',
          offset: 0,
          limit: 10,
        })
      ).items.map((t) => t.id),
    ).toEqual([loose]);
    expect((await tagQuery.refs([zonaprop, web])).map((t) => t.name)).toEqual(['Web', 'Zonaprop']);

    // Filtros de la grilla: con, sin y una etiqueta.
    const base = {
      view: 'active' as const,
      visibility: { kind: 'all' as const },
      text: undefined,
      agentId: undefined,
      branchId: undefined,
      kind: undefined,
      clientType: undefined,
      tagged: undefined,
      tagId: undefined,
      letter: undefined,
      anyOfTypes: undefined,
      created: { from: undefined, to: undefined },
      updated: { from: undefined, to: undefined },
    };
    const carla = await createClient('Carla', '+5491166899103');
    expect(await listQuery.count({ ...base, tagged: 'with' })).toBe(2);
    expect(await listQuery.count({ ...base, tagged: 'without' })).toBe(1);
    expect(await listQuery.count({ ...base, tagId: web })).toBe(0);
    expect(await listQuery.count({ ...base, tagId: zonaprop })).toBe(2);
    expect(carla).toBeDefined();
  });

  it('merges two tags without repeating them on the contacts that had both', async () => {
    const source = await createTag('Zona prop');
    const target = await createTag('Zonaprop');
    const ana = await createClient('Ana', '+5491166899101');
    const bruno = await createClient('Bruno', '+5491166899102');
    await tagClient(ana, [source, target]);
    await tagClient(bruno, [source]);

    const result = await new MergeClientTags({ uow, clock }).execute(
      { sourceTagId: source, targetTagId: target },
      manager,
    );

    expect(result.isOk() && result.value).toEqual({ moved: 2 });
    expect(
      await db
        .select({ clientId: clientTagAssignments.clientId, tagId: clientTagAssignments.tagId })
        .from(clientTagAssignments)
        .orderBy(clientTagAssignments.clientId),
    ).toEqual([ana, bruno].sort().map((clientId) => ({ clientId, tagId: target })));
    expect(await db.select({ id: clientTags.id }).from(clientTags)).toEqual([{ id: target }]);
  });

  it('pages more than 1.000 tags with LIMIT', async () => {
    const rows = Array.from({ length: 1_200 }, (_, i) => ({
      id: `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`,
      name: `Etiqueta ${(i + 1).toString().padStart(4, '0')}`,
      ...authored,
    }));
    for (let start = 0; start < rows.length; start += 500) {
      await db.insert(clientTags).values(rows.slice(start, start + 500));
    }

    const page = await tagQuery.searchTags({
      text: undefined,
      groupId: undefined,
      direction: 'asc',
      offset: 1_175,
      limit: 25,
    });
    expect(page.total).toBe(1_200);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]?.name).toBe('Etiqueta 1176');
  });
});

describe('client relations (Postgres)', () => {
  it('lists the relations of a contact in both directions, without the trash', async () => {
    const acme = await createClient('Acme', '+541147770001', { kind: 'company' });
    const juan = await createClient('Juan', '+5491166899104');
    const maria = await createClient('María', '+5491166899105');
    const link = new LinkClients({ uow, clock });
    for (const clientId of [juan, maria]) {
      const linked = await link.execute(
        { clientId, relatedClientId: acme, kind: 'works_at', label: 'Ventas' },
        manager,
      );
      if (linked.isErr()) throw new Error(linked.error.type);
    }
    await link.execute({ clientId: acme, relatedClientId: juan, kind: 'related' }, manager);

    const ofAcme = await relationQuery.list({
      clientId: acme,
      direction: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(ofAcme.total).toBe(3);
    expect(ofAcme.items.map((r) => [r.direction, r.kind, r.other.name, r.label])).toEqual([
      ['outgoing', 'related', 'Juan', undefined],
      ['incoming', 'works_at', 'Juan', 'Ventas'],
      ['incoming', 'works_at', 'María', 'Ventas'],
    ]);
    const page = await relationQuery.list({
      clientId: acme,
      direction: 'asc',
      offset: 2,
      limit: 1,
    });
    expect(page.items.map((r) => r.other.name)).toEqual(['María']);

    const ofJuan = await relationQuery.list({
      clientId: juan,
      direction: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(ofJuan.items.map((r) => [r.direction, r.kind, r.other.kind])).toEqual([
      ['incoming', 'related', 'company'],
      ['outgoing', 'works_at', 'company'],
    ]);

    await db.update(clients).set({ deletedAt: NOW, deletedBy: AGENT }).where(eq(clients.id, maria));
    expect(
      (await relationQuery.list({ clientId: acme, direction: 'asc', offset: 0, limit: 10 })).total,
    ).toBe(2);
  });
});

describe('MergeClients (Postgres)', () => {
  it('moves channels, tags, relations, opportunities, activity and the rest to the principal', async () => {
    const primary = await createClient('Ana Pérez', '+5491166899101', { email: 'ana@mail.com' });
    // El duplicado llegó por WhatsApp, con otro teléfono.
    const registered = await new RegisterContact({ uow, ids, clock }).execute(
      {
        channel: 'whatsapp',
        channelExternalId: '5491166899199',
        name: 'Ana P',
        phone: '+5491166899199',
        email: 'ana.p@mail.com',
        opportunity: { type: 'sale', intent: 'info' },
      },
      Actor.system('agent-ia', ['clients:create']),
    );
    if (registered.isErr()) throw new Error(registered.error.type);
    const duplicate = registered.value.clientId;
    const acme = await createClient('Acme', '+541147770001', { kind: 'company' });
    const tag = await createTag('Zonaprop');
    await tagClient(duplicate, [tag]);
    await new LinkClients({ uow, clock }).execute(
      { clientId: duplicate, relatedClientId: acme, kind: 'works_at' },
      manager,
    );
    // Acme declara una relación con el duplicado (entrante).
    await new LinkClients({ uow, clock }).execute(
      { clientId: acme, relatedClientId: duplicate, kind: 'related', label: 'Contacto' },
      manager,
    );
    await db.insert(clientActivities).values({
      id: ids.next(),
      clientId: duplicate,
      kind: 'note',
      actorId: AGENT,
      occurredAt: NOW,
      ...authored,
    });
    // Los dos tienen destacada la misma propiedad: la del duplicado queda quitada.
    for (const [clientId, propertyId] of [
      [primary, PROPERTY],
      [duplicate, PROPERTY],
      [duplicate, OTHER_PROPERTY],
    ] as const) {
      await db.insert(featuredListings).values({
        id: ids.next(),
        clientId,
        propertyId,
        featuredBy: AGENT,
        featuredAt: NOW,
        ...authored,
      });
    }
    await db.insert(inquiries).values({
      id: ids.next(),
      channel: 'zonaprop',
      receivedAt: NOW,
      clientId: duplicate,
      ...authored,
    });

    const result = await new MergeClients({ uow, clock }).execute(
      { primaryId: primary, duplicateId: duplicate },
      manager,
    );
    if (result.isErr()) throw new Error(result.error.type);

    expect(result.value.moved).toEqual({
      opportunities: 1,
      activities: 1,
      savedSearches: 0,
      featuredListings: 2,
      sharedListings: 0,
      inquiries: 1,
      incomingRelations: 1,
    });
    const merged = await repository.findById(clientId(primary));
    expect(merged?.phones.map((p) => p.phone.e164)).toEqual(['+5491166899101', '+5491166899199']);
    expect(merged?.emails.map((e) => e.email.value)).toEqual(['ana@mail.com', 'ana.p@mail.com']);
    expect(merged?.channels.map((c) => c.channel)).toEqual(['whatsapp']);
    expect(merged?.tagIds).toEqual([tag]);
    expect(merged?.relations).toEqual([
      { relatedClientId: acme, kind: 'works_at', label: undefined },
    ]);

    const [tombstone] = await db.select().from(clients).where(eq(clients.id, duplicate));
    expect(tombstone).toMatchObject({
      phoneE164: null,
      email: null,
      mergedIntoId: primary,
      deletedBy: AGENT,
    });
    expect(
      await db.select().from(clientChannels).where(eq(clientChannels.clientId, duplicate)),
    ).toEqual([]);
    expect(await db.select({ clientId: opportunities.clientId }).from(opportunities)).toEqual([
      { clientId: primary },
    ]);
    const featured = await db
      .select({
        propertyId: featuredListings.propertyId,
        removed: sql<boolean>`${featuredListings.removedAt} is not null`,
      })
      .from(featuredListings)
      .where(eq(featuredListings.clientId, primary));
    expect(featured).toHaveLength(3);
    expect(featured).toEqual(
      expect.arrayContaining([
        { propertyId: PROPERTY, removed: false },
        { propertyId: PROPERTY, removed: true },
        { propertyId: OTHER_PROPERTY, removed: false },
      ]),
    );
    expect(
      await db
        .select({ clientId: clientRelations.clientId, kind: clientRelations.kind })
        .from(clientRelations)
        .where(eq(clientRelations.relatedClientId, primary)),
    ).toEqual([{ clientId: acme, kind: 'related' }]);

    // El unificado no aparece en la papelera ni choca con los datos del principal.
    const trash = await listQuery.count({
      view: 'trash',
      visibility: { kind: 'all' },
      text: undefined,
      agentId: undefined,
      branchId: undefined,
      kind: undefined,
      clientType: undefined,
      tagged: undefined,
      tagId: undefined,
      letter: undefined,
      anyOfTypes: undefined,
      created: { from: undefined, to: undefined },
      updated: { from: undefined, to: undefined },
    });
    expect(trash).toBe(0);
    expect(
      await db
        .select({ action: auditLog.action, entityId: auditLog.entityId })
        .from(auditLog)
        .where(sql`${auditLog.action} like 'client.merged%'`)
        .orderBy(auditLog.action),
    ).toEqual([
      { action: 'client.merged', entityId: primary },
      { action: 'client.merged_into', entityId: duplicate },
    ]);
  });
});

describe('agenda letters (Postgres)', () => {
  it('groups by the initial without accents and sends the rest to #', async () => {
    for (const [i, name] of ['Ana', 'Álvaro', 'bruno', 'Ñandú SA', '123 Inmobiliaria'].entries()) {
      await createClient(name, `+54911668991${(10 + i).toString()}`);
    }
    const base = {
      view: 'active' as const,
      visibility: { kind: 'all' as const },
      text: undefined,
      agentId: undefined,
      branchId: undefined,
      kind: undefined,
      clientType: undefined,
      tagged: undefined,
      tagId: undefined,
      letter: undefined,
      anyOfTypes: undefined,
      created: { from: undefined, to: undefined },
      updated: { from: undefined, to: undefined },
    };

    const letters = await listQuery.letters(base);
    expect(new Map(letters.map((l) => [l.letter, l.count]))).toEqual(
      new Map([
        ['A', 2],
        ['B', 1],
        ['N', 1],
        ['#', 1],
      ]),
    );
    const letterA = await listQuery.search({
      ...base,
      letter: 'A',
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 25,
    });
    // El orden entre "Ana" y "Álvaro" depende de la intercalación de la base.
    expect(letterA.items.map((c) => c.name).sort()).toEqual(['Ana', 'Álvaro'].sort());
    const hash = await listQuery.search({
      ...base,
      letter: '#',
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 25,
    });
    expect(hash.items.map((c) => c.name)).toEqual(['123 Inmobiliaria']);
  });
});
