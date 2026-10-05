import {
  DeleteInquiry,
  ReceiveInquiry,
  RestoreInquiry,
  type InquiryInboxCriteria,
  type InquiryPropertyLookup,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, inquiries, outbox } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleInquiryInboxQuery } from './drizzle-inquiry-inbox-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T15:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const inbox = new DrizzleInquiryInboxQuery(db);

const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000a1', ['inquiries:manage']);
const WEB = Actor.system('web', ['inquiries:receive']);

const properties: InquiryPropertyLookup = {
  facts: (propertyId) =>
    Promise.resolve(
      propertyId === PROPERTY
        ? {
            branchId: BRANCH,
            propertyType: 'house',
            operations: ['sale'],
            neighborhood: 'Belgrano',
          }
        : undefined,
    ),
};
const receive = new ReceiveInquiry({ uow, properties, ids, clock });

const INPUT = {
  channel: 'zonaprop',
  externalId: 'ZP-4521',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  phone: '+54 9 11 6689-9124',
  message: '¿Sigue disponible?',
  propertyId: PROPERTY,
} as const;

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function criteria(overrides: Partial<InquiryInboxCriteria> = {}): InquiryInboxCriteria {
  return {
    tab: 'pending',
    branchId: undefined,
    channel: undefined,
    propertyId: undefined,
    received: { from: undefined, to: undefined },
    sort: { field: 'receivedAt', direction: 'desc' },
    offset: 0,
    limit: 100,
    ...overrides,
  };
}

describe('ReceiveInquiry (Postgres)', () => {
  it('reprocessing the same inquiry keeps one row, one event and one audit entry', async () => {
    const first = unwrap(await receive.execute(INPUT, WEB));
    const again = unwrap(await receive.execute(INPUT, WEB));

    expect(again).toEqual({ inquiryId: first.inquiryId, duplicate: true });
    const rows = await db.select().from(inquiries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: 'zonaprop',
      externalId: 'ZP-4521',
      status: 'pending',
      senderEmail: 'ana@example.com',
      senderPhoneE164: '+5491166899124',
      senderPhoneMatchKey: '+541166899124',
      branchId: BRANCH,
      autoTags: ['channel:zonaprop', 'operation:sale', 'type:house', 'neighborhood:Belgrano'],
      createdBy: 'system:web',
    });
    expect(await db.select().from(outbox)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it('two deliveries at the same time create a single inquiry', async () => {
    const results = await Promise.all([
      receive.execute(INPUT, WEB),
      receive.execute(INPUT, WEB),
      receive.execute(INPUT, WEB),
    ]);

    const outputs = results.map(unwrap);
    expect(new Set(outputs.map((o) => o.inquiryId)).size).toBe(1);
    expect(outputs.filter((o) => !o.duplicate)).toHaveLength(1);
    expect(await db.select().from(inquiries)).toHaveLength(1);
    expect(await db.select().from(outbox)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it('deletes and restores through the repository', async () => {
    const { inquiryId } = unwrap(await receive.execute(INPUT, WEB));

    unwrap(await new DeleteInquiry({ uow, clock }).execute({ inquiryId }, MANAGER));
    expect((await inbox.search(criteria({ tab: 'deleted' }))).items).toEqual([
      expect.objectContaining({ id: inquiryId, status: 'deleted', deletedBy: MANAGER.id }),
    ]);
    expect(await inbox.countPending()).toBe(0);

    unwrap(await new RestoreInquiry({ uow, clock }).execute({ inquiryId }, MANAGER));
    expect((await inbox.search(criteria())).items.map((i) => i.id)).toEqual([inquiryId]);
    expect(await inbox.countPending()).toBe(1);
  });
});

describe('DrizzleInquiryInboxQuery', () => {
  const NOW = new Date('2026-03-01T12:00:00Z');
  const HOUR = 3_600_000;

  /** 30 consultas, una por hora: pendientes y asignadas alternadas, cada 5 una borrada. */
  async function seed(): Promise<string[]> {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const deleted = i % 5 === 4;
      const assigned = i % 2 === 1;
      return {
        id: `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`,
        channel: i % 3 === 0 ? 'zonaprop' : 'web_form',
        externalId: `ext-${i}`,
        receivedAt: new Date(NOW.getTime() + i * HOUR),
        senderName: `Persona ${i}`,
        senderEmail: `persona${i}@example.com`,
        propertyId: i % 4 === 0 ? PROPERTY : null,
        branchId: i < 15 ? BRANCH : OTHER_BRANCH,
        status: deleted ? 'deleted' : assigned ? 'assigned' : 'pending',
        assignedAgentId: assigned ? MANAGER.id : null,
        deletedAt: deleted ? NOW : null,
        deletedBy: deleted ? MANAGER.id : null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: 'system:web',
        updatedBy: 'system:web',
      };
    });
    await db.insert(inquiries).values(rows);
    return rows.map((r) => r.id);
  }

  it('splits the tabs and counts the pending ones', async () => {
    await seed();

    const pending = await inbox.search(criteria());
    const assigned = await inbox.search(criteria({ tab: 'assigned' }));
    const deleted = await inbox.search(criteria({ tab: 'deleted' }));

    expect([pending.total, assigned.total, deleted.total]).toEqual([12, 12, 6]);
    expect(pending.items.every((i) => i.status === 'pending')).toBe(true);
    expect(assigned.items.every((i) => i.status === 'assigned' && i.assignedAgentId)).toBe(true);
    expect(deleted.items.every((i) => i.deletedAt !== undefined)).toBe(true);
    expect(await inbox.countPending()).toBe(12);
  });

  it('counts each tab with the same filters as its list', async () => {
    await seed();
    const noFilters = { branchId: undefined, channel: undefined, propertyId: undefined };
    const received = { from: undefined, to: undefined };

    expect(await inbox.countByTab({ ...noFilters, received })).toEqual({
      pending: 12,
      assigned: 12,
      deleted: 6,
    });

    const filters = { ...noFilters, branchId: BRANCH, channel: 'zonaprop' as const, received };
    const totals = await Promise.all(
      (['pending', 'assigned', 'deleted'] as const).map(
        async (tab) => (await inbox.search(criteria({ tab, ...filters }))).total,
      ),
    );
    const counts = await inbox.countByTab(filters);
    expect([counts.pending, counts.assigned, counts.deleted]).toEqual(totals);
    expect(totals.reduce((a, b) => a + b)).toBe(5);
  });

  it('filters by branch, channel, property and reception date', async () => {
    await seed();
    const all = (await inbox.search(criteria())).items;

    const byBranch = await inbox.search(criteria({ branchId: OTHER_BRANCH }));
    expect(byBranch.items.map((i) => i.id)).toEqual(
      all.filter((i) => i.branchId === OTHER_BRANCH).map((i) => i.id),
    );
    const byChannel = await inbox.search(criteria({ channel: 'zonaprop' }));
    expect(byChannel.items.map((i) => i.id)).toEqual(
      all.filter((i) => i.channel === 'zonaprop').map((i) => i.id),
    );
    const byProperty = await inbox.search(criteria({ propertyId: PROPERTY }));
    expect(byProperty.items.map((i) => i.id)).toEqual(
      all.filter((i) => i.propertyId === PROPERTY).map((i) => i.id),
    );
    const from = new Date(NOW.getTime() + 4 * HOUR);
    const to = new Date(NOW.getTime() + 10 * HOUR);
    const byDate = await inbox.search(criteria({ received: { from, to } }));
    expect(byDate.items.map((i) => i.receivedAt)).toEqual(
      all.filter((i) => i.receivedAt >= from && i.receivedAt < to).map((i) => i.receivedAt),
    );
    expect(byDate.total).toBe(2);

    const combined = await inbox.search(
      criteria({ tab: 'assigned', branchId: BRANCH, channel: 'zonaprop' }),
    );
    // La de las 9 h cumple todo pero está borrada.
    expect(combined.items.map((i) => i.receivedAt.getTime())).toEqual([NOW.getTime() + 3 * HOUR]);
  });

  it('pages without losing or repeating rows, in both directions', async () => {
    await seed();

    for (const direction of ['desc', 'asc'] as const) {
      const seen: string[] = [];
      for (let offset = 0; offset < 12; offset += 5) {
        const page = await inbox.search(
          criteria({ sort: { field: 'receivedAt', direction }, offset, limit: 5 }),
        );
        expect(page.total).toBe(12);
        seen.push(...page.items.map((i) => i.id));
      }
      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
      const sorted = [...seen].sort();
      expect(seen).toEqual(direction === 'asc' ? sorted : sorted.reverse());
    }
  });
});
