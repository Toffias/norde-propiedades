import {
  AddClientNote,
  Client,
  EraseClientData,
  MergeClients,
  RunClientImport,
  StartClientImport,
} from '@norde/core/clients';
import { Actor, parseId, Phone } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { arrayContains, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { XlsxSpreadsheetReader } from '../adapters/imports/xlsx-spreadsheet-reader';
import { LocalFileStorage } from '../adapters/storage/local-file-storage';
import * as schema from '../db/schema';
import {
  auditLog,
  clientActivities,
  clientPhones,
  clients,
  erasureRecords,
  importJobErrors,
  importJobs,
  importMappings,
  opportunities,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientImportQuery } from './drizzle-client-imports';
import { DrizzleClientRepository } from './drizzle-client-repositories';

const db = useTestDatabase();
const clock = new FixedClock('2026-10-02T12:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const repository = new DrizzleClientRepository(db, ids);
const imports = new DrizzleClientImportQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-02T12:00:00Z');

const manager = Actor.user(AGENT, ['clients:*']).withBranch(BRANCH);
const importJob = Actor.system('import', ['clients:run-imports']);
const agents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: () => Promise.resolve({ branchId: BRANCH }),
};

async function seedClient(name: string, phone: string): Promise<string> {
  const id = parseId<'Client'>(ids.next());
  const parsedPhone = Phone.create(phone);
  if (id.isErr() || parsedPhone.isErr()) throw new Error('invalid fixture');
  const created = Client.create({
    id: id.value,
    kind: 'person',
    name,
    phones: [{ kind: 'mobile', phone: parsedPhone.value, contactHours: undefined }],
    emails: [],
    clientTypes: [],
    agentId: AGENT,
    branchId: BRANCH,
    profile: {},
    now: NOW,
  });
  if (created.isErr()) throw new Error(created.error.type);
  await repository.save(created.value, AGENT);
  return id.value;
}

async function auditFor(clientId: string) {
  return db
    .select()
    .from(auditLog)
    .where(arrayContains(auditLog.clientIds, [clientId]));
}

async function xlsx(rows: readonly ExcelJS.CellValue[][]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contactos');
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/** El plan de la página que pide `run`, con `enable_seqscan = off`. */
async function pagePlan(
  run: (query: DrizzleClientImportQuery) => Promise<unknown>,
): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await run(new DrizzleClientImportQuery(logged));
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

function scansWithIndex(nodes: readonly PlanNode[], table: string): boolean {
  return !nodes.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === table);
}

describe('EraseClientData', () => {
  it('erases the client, its merged duplicate, everything of the module and its audit trail', async () => {
    const ana = await seedClient('Ana Pérez', '+5491166899124');
    const duplicate = await seedClient('Ana P.', '+541147770000');
    const other = await seedClient('Juan Gómez', '+5491155550000');
    const merged = await new MergeClients({ uow, ids, clock }).execute(
      { primaryId: ana, duplicateId: duplicate },
      manager,
    );
    if (merged.isErr()) throw new Error(merged.error.type);
    const note = await new AddClientNote({ uow, ids, clock }).execute(
      { clientId: ana, text: 'Pidió que borremos sus datos' },
      manager,
    );
    if (note.isErr()) throw new Error(note.error.type);
    await db.insert(opportunities).values({
      id: ids.next(),
      clientId: ana,
      originChannel: 'whatsapp',
      type: 'sale',
      intent: 'info',
      status: 'new',
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: AGENT,
      updatedBy: AGENT,
    });
    await db.insert(auditLog).values({
      id: ids.next(),
      actorId: AGENT,
      action: 'client.updated',
      entityType: 'client',
      entityId: other,
      source: 'gestion',
      clientIds: [other],
      occurredAt: NOW,
    });
    await db.insert(importMappings).values({
      id: ids.next(),
      source: 'tokko',
      entityType: 'client',
      externalId: '4242',
      internalId: ana,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect((await auditFor(ana)).length).toBeGreaterThan(0);

    const result = await new EraseClientData({ uow, ids, clock }).execute(
      { clientId: ana, confirmation: 'ana perez', requestedOn: '2026-10-01' },
      manager,
    );

    expect(result.isOk() && [...result.value.erasedClientIds].sort()).toEqual(
      [ana, duplicate].sort(),
    );
    const left = await db.select({ id: clients.id }).from(clients);
    expect(left.map((c) => c.id)).toEqual([other]);
    expect(await db.select().from(clientPhones).where(eq(clientPhones.clientId, ana))).toEqual([]);
    expect(await db.select().from(clientActivities)).toEqual([]);
    expect(await db.select().from(opportunities)).toEqual([]);
    expect(await auditFor(ana)).toEqual([]);
    expect(await auditFor(duplicate)).toEqual([]);
    expect(await auditFor(other)).toMatchObject([{ action: 'client.updated', entityId: other }]);
    const [mapping] = await db.select().from(importMappings);
    expect(mapping?.erasedAt).toEqual(NOW);
    expect(await db.select().from(erasureRecords)).toMatchObject([
      {
        erasedEntityType: 'client',
        erasedEntityId: ana,
        requestedAt: new Date('2026-10-01T03:00:00Z'),
        executedBy: AGENT,
        executedAt: NOW,
      },
    ]);
    const [erasedEntry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'client.erased'));
    expect(erasedEntry).toMatchObject({ entityId: ana, clientIds: [] });
  });
});

describe('client imports', () => {
  it('imports an Excel file through the job, with the duplicate rule and the rows that failed', async () => {
    await seedClient('Existente', '+541147770000');
    // El storage en disco valida las claves como el de producción.
    const storage = new LocalFileStorage(await mkdtemp(join(tmpdir(), 'norde-import-')));
    const reader = new XlsxSpreadsheetReader();
    const bytes = await xlsx([
      ['Nombre', 'Celular', 'Email', 'Tipos de cliente'],
      ['Ana Pérez', '+54 9 11 6689-9124', 'ana@mail.com', 'Comprador'],
      ['Juan Gómez', '', 'juan@mail.com', ''],
      ['Existente', '011 4777-0000', '', ''],
      ['Sin datos', '', '', ''],
    ]);
    const started = await new StartClientImport({
      uow,
      reader,
      storage,
      agents,
      ids,
      clock,
    }).execute(
      {
        fileName: 'contactos.xlsx',
        bytes,
        mapping: { name: 0, mobile: 1, email: 2, clientTypes: 3 },
      },
      manager,
    );
    if (started.isErr()) throw new Error(started.error.type);
    const { importId } = started.value;

    const run = new RunClientImport({ uow, reader, storage, ids, clock });
    const done = await run.execute({ importId }, importJob);
    const again = await run.execute({ importId }, importJob);

    expect(done.isOk() && done.value.status).toBe('done');
    expect(again.isOk() && again.value.status).toBe('done');
    const item = await imports.find(importId);
    expect(item).toMatchObject({
      fileName: 'contactos.xlsx',
      status: 'done',
      requestedBy: AGENT,
      agentId: AGENT,
      totals: { rows: 4, processed: 4, created: 2, duplicates: 1, failed: 1 },
    });
    const names = await db
      .select({ name: clients.name, createdBy: clients.createdBy })
      .from(clients);
    expect(
      names
        .filter((c) => c.createdBy === 'system:import')
        .map((c) => c.name)
        .sort(),
    ).toEqual(['Ana Pérez', 'Juan Gómez']);
    const problems = await imports.problems({ importId, direction: 'asc', offset: 0, limit: 10 });
    expect(problems.items).toMatchObject([
      { rowNumber: 4, code: 'duplicate', field: undefined },
      { rowNumber: 5, code: 'missing_contact', field: undefined, clientId: undefined },
    ]);
    expect(problems.items[0]?.clientId).toEqual(expect.any(String));
    expect(await storage.get(`imports/clients/${importId}`)).toBeUndefined();
    const created = await db.select().from(auditLog).where(eq(auditLog.action, 'client.created'));
    expect(
      created.every((e) => e.actorId === 'system:import' && e.correlationId === importId),
    ).toBe(true);
  });

  it('pages 1,200 imports and their problems with LIMIT and an index, without losing rows', async () => {
    const TOTAL = 1_200;
    const jobs = Array.from({ length: TOTAL }, (_, i) => ({
      id: `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`,
      kind: 'clients_xlsx',
      status: 'done',
      fileName: `archivo-${i}.xlsx`,
      storageKey: `imports/clients/${i}`,
      options: { mapping: { name: 0, email: 1 } },
      totals: { rows: 1, processed: 1, created: 1, duplicates: 0, failed: 0 },
      // Varias en el mismo instante: el ID desempata.
      createdAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 3) * 60_000),
      updatedAt: NOW,
      createdBy: AGENT,
      updatedBy: AGENT,
    }));
    const otherKind = Array.from({ length: 300 }, (_, i) => ({
      ...jobs[0],
      id: `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`,
      kind: 'tokko_api',
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
      createdBy: AGENT,
      updatedBy: AGENT,
      updatedAt: NOW,
      status: 'done',
    }));
    for (let start = 0; start < jobs.length; start += 500) {
      await db.insert(importJobs).values(jobs.slice(start, start + 500));
    }
    await db.insert(importJobs).values(otherKind);
    const target = jobs[0]?.id ?? '';
    const problems = Array.from({ length: TOTAL }, (_, i) => ({
      id: `00000000-0000-7000-a000-${(i + 1).toString().padStart(12, '0')}`,
      jobId: target,
      rowNumber: Math.floor(i / 2) + 2,
      entityType: 'client',
      message: 'invalid_email',
      raw: { field: 'email' },
      createdAt: NOW,
    }));
    for (let start = 0; start < problems.length; start += 500) {
      await db.insert(importJobErrors).values(problems.slice(start, start + 500));
    }
    await db.execute(sql`analyze core.import_jobs; analyze core.import_job_errors`);

    const seen: string[] = [];
    for (let offset = 0; offset < TOTAL; offset += 100) {
      const page = await imports.list({ direction: 'desc', offset, limit: 100 });
      expect(page.total).toBe(TOTAL);
      seen.push(...page.items.map((item) => item.id));
    }
    expect(new Set(seen).size).toBe(TOTAL);
    const times = seen.map((id) => jobs.find((j) => j.id === id)?.createdAt.getTime() ?? 0);
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const rows: number[] = [];
    for (let offset = 0; offset < TOTAL; offset += 250) {
      const page = await imports.problems({
        importId: target,
        direction: 'asc',
        offset,
        limit: 250,
      });
      expect(page.total).toBe(TOTAL);
      rows.push(...page.items.map((p) => p.rowNumber));
    }
    expect(rows).toHaveLength(TOTAL);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));

    expect(
      scansWithIndex(
        await pagePlan((q) => q.list({ direction: 'desc', offset: 0, limit: 25 })),
        'import_jobs',
      ),
    ).toBe(true);
    expect(
      scansWithIndex(
        await pagePlan((q) =>
          q.problems({ importId: target, direction: 'asc', offset: 0, limit: 25 }),
        ),
        'import_job_errors',
      ),
    ).toBe(true);
  });
});
