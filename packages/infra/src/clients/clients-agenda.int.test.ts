import {
  Client,
  CreateClient,
  DeleteClient,
  RestoreClient,
  UpdateClientDetails,
  type ClientListCriteria,
  type ClientListQuery,
} from '@norde/core/clients';
import { Actor, Email, parseId, Phone } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import { auditLog, clientEmails, clientPhones, clients } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientListQuery } from './drizzle-client-list-query';
import { DrizzleClientRepository } from './drizzle-client-repositories';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const repository = new DrizzleClientRepository(db, ids);
const query = new DrizzleClientListQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-03-01T10:00:00Z');

const manager = Actor.user(AGENT, ['clients:*', 'audit:*']).withBranch(BRANCH);
const agents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: () => Promise.resolve({ branchId: BRANCH }),
};

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

describe('DrizzleClientRepository (agenda)', () => {
  it('saves and loads every phone, email and profile field, with authorship', async () => {
    const id = parseId<'Client'>(ids.next()).unwrapOr(undefined as never);
    const created = Client.create({
      id,
      kind: 'company',
      name: 'Acme SA',
      phones: [
        { kind: 'work', phone: phone('011 4777-0000'), contactHours: 'de 9 a 18' },
        { kind: 'mobile', phone: phone('+5491166899124'), contactHours: undefined },
      ],
      emails: [
        { kind: 'main', email: email('info@acme.com') },
        { kind: 'work', email: email('ventas@acme.com') },
      ],
      clientTypes: ['owner_seller', 'investor'],
      agentId: AGENT,
      branchId: BRANCH,
      profile: { companyName: 'Acme', birthDate: '1990-05-04', documentType: 'cuit' },
      now: NOW,
    });
    if (created.isErr()) throw new Error(created.error.type);
    await repository.save(created.value, AGENT);

    const loaded = await repository.findById(id);
    expect(loaded?.toSnapshot()).toEqual(created.value.toSnapshot());
    expect(await db.select().from(clients)).toMatchObject([
      {
        phoneE164: '+541147770000',
        email: 'info@acme.com',
        createdBy: AGENT,
        updatedBy: AGENT,
        clientTypes: ['owner_seller', 'investor'],
      },
    ]);

    // Guardar sin cambios en las listas no reescribe las filas hijas.
    const [before] = await db.select({ id: clientPhones.id }).from(clientPhones).limit(1);
    if (!loaded) throw new Error('not found');
    loaded.rename('Acme Sociedad Anónima', NOW);
    await repository.save(loaded, OTHER);
    const [after] = await db.select({ id: clientPhones.id }).from(clientPhones).limit(1);
    expect(after?.id).toBe(before?.id);
    expect(await db.select({ updatedBy: clients.updatedBy }).from(clients)).toEqual([
      { updatedBy: OTHER },
    ]);
  });

  it('finds duplicates by a secondary phone or email, also in the trash', async () => {
    const create = new CreateClient({ uow, agents, ids, clock });
    const result = await create.execute(
      {
        name: 'Ana',
        phones: [
          { kind: 'main', number: '011 4777-0000' },
          { kind: 'mobile', number: '+5491166899124' },
        ],
        emails: [
          { kind: 'main', address: 'ana@mail.com' },
          { kind: 'work', address: 'ana@empresa.com' },
        ],
      },
      manager,
    );
    if (result.isErr()) throw new Error(result.error.type);
    await new DeleteClient({ uow, clock }).execute({ clientId: result.value.clientId }, manager);

    const bySecondaryPhone = await repository.findMatching({
      phones: [phone('11 6689-9124')],
      emails: [],
    });
    const bySecondaryEmail = await repository.findMatching({
      phones: [],
      emails: [email('ANA@empresa.com')],
    });

    expect(bySecondaryPhone.map((c) => c.id)).toEqual([result.value.clientId]);
    expect(bySecondaryPhone[0]?.isDeleted).toBe(true);
    expect(bySecondaryEmail.map((c) => c.id)).toEqual([result.value.clientId]);
    expect(await repository.findByName('ANA')).toEqual([]);

    const again = await create.execute(
      { name: 'Ana', phones: [{ kind: 'mobile', number: '11 6689-9124' }] },
      manager,
    );
    expect(again.isErr() && again.error).toEqual({
      type: 'DuplicateClient',
      clientId: result.value.clientId,
      trashed: true,
    });

    await new RestoreClient({ uow, clock }).execute({ clientId: result.value.clientId }, manager);
    // Sin distinguir mayúsculas ni acentos.
    expect((await repository.findByName('ÁNA')).map((c) => c.id)).toEqual([result.value.clientId]);
  });

  it('writes the edition of phones and emails with its diff in the same transaction', async () => {
    const create = new CreateClient({ uow, agents, ids, clock });
    const created = await create.execute(
      { name: 'Ana', phones: [{ kind: 'mobile', number: '+5491166899124' }] },
      manager,
    );
    if (created.isErr()) throw new Error(created.error.type);
    const { clientId } = created.value;

    const updated = await new UpdateClientDetails({ uow, clock }).execute(
      {
        clientId,
        contact: {
          phones: [{ kind: 'work', number: '011 4777-0000', contactHours: 'Mañanas' }],
          emails: [{ kind: 'main', address: 'ana@mail.com' }],
        },
      },
      manager,
    );
    if (updated.isErr()) throw new Error(updated.error.type);

    expect(
      await db.select({ e164: clientPhones.phoneE164, kind: clientPhones.kind }).from(clientPhones),
    ).toEqual([{ e164: '+541147770000', kind: 'work' }]);
    expect(await db.select({ email: clientEmails.email }).from(clientEmails)).toEqual([
      { email: 'ana@mail.com' },
    ]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'client.updated'));
    expect(entries).toMatchObject([
      {
        entityId: clientId,
        clientIds: [clientId],
        changes: {
          phones: {
            before: [{ kind: 'mobile', number: '+5491166899124' }],
            after: [{ kind: 'work', number: '+541147770000', contactHours: 'Mañanas' }],
          },
          emails: { before: null, after: [{ kind: 'main', address: 'ana@mail.com' }] },
        },
      },
    ]);
  });
});

// ---------- Grilla de contactos ----------

const TOTAL = 5_000;
const TYPES = [[], ['buyer'], ['owner_seller'], ['tenant', 'owner_landlord']] as const;

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error('Empty list');
  return item;
}

/** 5.000 contactos con una distribución conocida, insertados en SQL por volumen. */
async function seedAgenda(): Promise<void> {
  const rows = Array.from({ length: TOTAL }, (_, i) => {
    const deleted = i % 50 === 0;
    return {
      id: `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`,
      name: `Contacto ${(i + 1).toString().padStart(5, '0')}`,
      kind: 'person',
      phoneE164: `+5411${(40_000_000 + i).toString()}`,
      phoneMatchKey: `+5411${(40_000_000 + i).toString()}`,
      email: `contacto${i + 1}@mail.com`,
      clientTypes: [...pick(TYPES, i)],
      agentId: i % 10 === 0 ? AGENT : OTHER,
      branchId: i % 4 === 0 ? BRANCH : null,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 3_600_000),
      updatedAt: new Date(Date.UTC(2026, 0, 1) + ((i * 7919) % TOTAL) * 60_000),
      createdBy: 'system:import',
      updatedBy: 'system:import',
      deletedAt: deleted ? NOW : null,
      deletedBy: deleted ? OTHER : null,
    };
  });
  for (let start = 0; start < rows.length; start += 500) {
    await db.insert(clients).values(rows.slice(start, start + 500));
  }
  // Un celular por contacto, para la columna "Celular".
  const phones = rows.map((row, i) => ({
    id: `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`,
    clientId: row.id,
    kind: 'mobile',
    phoneE164: `+54911${(50_000_000 + i).toString()}`,
    phoneMatchKey: `+5411${(50_000_000 + i).toString()}`,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  }));
  for (let start = 0; start < phones.length; start += 500) {
    await db.insert(clientPhones).values(phones.slice(start, start + 500));
  }
  await db.execute(sql`analyze core.clients; analyze core.client_phones`);
}

const BASE: ClientListCriteria = {
  view: 'active',
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
  sort: { field: 'updatedAt', direction: 'desc' },
  offset: 0,
  limit: 25,
};

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Index Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/**
 * El plan de la consulta de la página, con `enable_seqscan = off`: Postgres solo recorre la tabla
 * entera si no tiene un índice que resuelva el filtro y el orden (ver `properties.int.test.ts`).
 */
async function pagePlan(criteria: ClientListCriteria): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    const list: ClientListQuery = new DrizzleClientListQuery(logged);
    await list.search(criteria);
    const page = captured.find((q) => /\blimit\b/i.test(q.sql) && !/count\(/i.test(q.sql));
    if (!page) throw new Error('No page query captured');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local enable_seqscan = off');
      const result = await client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
        `explain (format json) ${page.sql}`,
        page.params,
      );
      await client.query('rollback');
      const [plan] = result.rows[0]?.['QUERY PLAN'] ?? [];
      if (!plan) throw new Error('No plan');
      return flatten(plan.Plan);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function scansWithIndex(nodes: readonly PlanNode[]): boolean {
  return !nodes.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'clients');
}

describe('DrizzleClientListQuery', () => {
  it('pages 5.000 contacts in the database with LIMIT', async () => {
    await seedAgenda();

    const firstPage = await query.search(BASE);
    expect(firstPage.total).toBe(TOTAL - TOTAL / 50);
    expect(firstPage.items).toHaveLength(25);
    const updated = firstPage.items.map((item) => item.updatedAt.getTime());
    expect(updated).toEqual([...updated].sort((a, b) => b - a));
    expect(firstPage.items[0]?.mobile).toMatch(/^\+54911/);

    const lastPage = await query.search({ ...BASE, offset: 4_900 - 25 });
    expect(lastPage.items).toHaveLength(25);
    expect((await query.search({ ...BASE, offset: 4_900 })).items).toEqual([]);

    const trash = await query.search({ ...BASE, view: 'trash' });
    expect(trash.total).toBe(TOTAL / 50);
    expect(trash.items[0]).toMatchObject({ deletedBy: OTHER, deletedAt: NOW });
  });

  it('applies the visibility of the actor in SQL', async () => {
    await seedAgenda();

    const own = await query.search({ ...BASE, visibility: { kind: 'own', ownerId: AGENT } });
    expect(own.total).toBe(TOTAL / 10 - TOTAL / 50);
    expect(own.items.every((item) => item.agentId === AGENT)).toBe(true);

    const branch = await query.search({
      ...BASE,
      visibility: { kind: 'branch', ownerId: AGENT, branchId: BRANCH },
    });
    // Los suyos (1 de cada 10) más los de la sucursal (1 de cada 4), sin los borrados.
    const expected = Array.from({ length: TOTAL }, (_, i) => i).filter(
      (i) => i % 50 !== 0 && (i % 10 === 0 || i % 4 === 0),
    ).length;
    expect(branch.total).toBe(expected);

    expect((await query.search({ ...BASE, visibility: { kind: 'none' } })).total).toBe(0);
  });

  it('filters by text, agent, branch, types and dates, and sorts by name', async () => {
    await seedAgenda();

    const byName = await query.search({ ...BASE, text: 'contacto 00042' });
    expect(byName.items.map((item) => item.name)).toEqual(['Contacto 00042']);
    const byEmail = await query.search({ ...BASE, text: 'contacto43@mail' });
    expect(byEmail.items.map((item) => item.email)).toEqual(['contacto43@mail.com']);

    expect((await query.search({ ...BASE, agentId: AGENT })).total).toBe(TOTAL / 10 - TOTAL / 50);
    expect((await query.search({ ...BASE, branchId: BRANCH })).total).toBe(TOTAL / 4 - TOTAL / 100);

    const buyers = await query.search({ ...BASE, clientType: 'buyer' });
    expect(buyers.items.every((item) => item.clientTypes.includes('buyer'))).toBe(true);
    const owners = await query.search({
      ...BASE,
      anyOfTypes: ['owner_seller', 'owner_landlord'],
    });
    expect(owners.total).toBeGreaterThan(buyers.total);

    // Las primeras 24 horas de creación: un contacto por hora.
    const firstDay = await query.search({
      ...BASE,
      created: { from: new Date(Date.UTC(2025, 0, 1)), to: new Date(Date.UTC(2025, 0, 2)) },
    });
    expect(firstDay.total).toBe(24 - 1);

    const byNameAsc = await query.search({ ...BASE, sort: { field: 'name', direction: 'asc' } });
    expect(byNameAsc.items[0]?.name).toBe('Contacto 00002');
    const newest = await query.search({ ...BASE, sort: { field: 'createdAt', direction: 'desc' } });
    expect(newest.items[0]?.name).toBe('Contacto 05000');
    expect(await query.count({ ...BASE, agentId: AGENT })).toBe(TOTAL / 10 - TOTAL / 50);
  });

  it('counts the agenda letters and pages one letter with LIMIT', async () => {
    await seedAgenda();

    expect(await query.letters(BASE)).toEqual([{ letter: 'C', count: TOTAL - TOTAL / 50 }]);
    const letterC = await query.search({
      ...BASE,
      letter: 'C',
      sort: { field: 'name', direction: 'asc' },
      offset: 25,
    });
    expect(letterC.total).toBe(TOTAL - TOTAL / 50);
    expect(letterC.items).toHaveLength(25);
    expect((await query.search({ ...BASE, letter: 'A' })).total).toBe(0);
  });

  it.each<[string, Partial<ClientListCriteria>]>([
    ['default sort', {}],
    ['name', { sort: { field: 'name', direction: 'asc' } }],
    ['creation date', { sort: { field: 'createdAt', direction: 'desc' } }],
    ['text', { text: 'contacto 00042' }],
    ['agent', { agentId: AGENT }],
    ['branch', { branchId: BRANCH }],
    ['client type', { clientType: 'buyer' }],
    ['owners', { anyOfTypes: ['owner_seller', 'owner_landlord'] }],
    [
      'creation range',
      { created: { from: new Date(Date.UTC(2025, 0, 1)), to: new Date(Date.UTC(2025, 0, 2)) } },
    ],
    [
      'update range',
      { updated: { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 0, 2)) } },
    ],
    ['own contacts', { visibility: { kind: 'own', ownerId: AGENT } }],
    ['branch contacts', { visibility: { kind: 'branch', ownerId: AGENT, branchId: BRANCH } }],
    ['trash', { view: 'trash' }],
    ['kind', { kind: 'company' }],
    ['letter page', { letter: 'C', sort: { field: 'name', direction: 'asc' } }],
    ['letter #', { letter: '#', sort: { field: 'name', direction: 'asc' } }],
    ['with tags', { tagged: 'with' }],
    ['without tags', { tagged: 'without' }],
    ['one tag', { tagId: '00000000-0000-7000-8000-0000000000f1' }],
  ])('resolves the %s with an index', async (_name, criteria) => {
    await seedAgenda();
    const nodes = await pagePlan({ ...BASE, ...criteria });
    const summary = nodes.map((n) => [n['Node Type'], n['Relation Name'], n['Index Name']]);
    expect(scansWithIndex(nodes), JSON.stringify(summary)).toBe(true);
  });
});
