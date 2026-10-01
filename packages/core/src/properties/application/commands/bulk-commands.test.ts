import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_BULK_EDIT, MAX_PDF_EXPORT_ROWS, type BulkEditPropertiesInput } from '../../contracts';
import {
  aPanelItem,
  BRANCH_ID,
  FakeExportWriter,
  InMemoryProducers,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  propertySnapshot,
  StubPanelPropertyListQuery,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { BulkEditProperties } from './bulk-edit-properties';
import { ExportProperties } from './export-properties';

const A = '00000000-0000-7000-8000-0000000000c1';
const B = '00000000-0000-7000-8000-0000000000c2';
const C = '00000000-0000-7000-8000-0000000000c3';
const NEW_PRODUCER = '00000000-0000-7000-8000-0000000000a9';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b9';
const TAG = '00000000-0000-7000-8000-0000000000f1';

/** Edita en masa lo suyo. */
const AGENT = Actor.user(PRODUCER_ID, [
  'properties:read',
  'properties:update',
  'properties:bulk-edit',
]).withBranch(BRANCH_ID);
/** Edita en masa todo, cambia captadores y marca disponibles. */
const MANAGER = Actor.user(OTHER_USER_ID, ['properties:*']);

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  // A y B son del agente; C, de otro captador de otra sucursal.
  uow.properties.rows.set(A, propertySnapshot({ id: A, code: 'DEP0001' }));
  uow.properties.rows.set(B, propertySnapshot({ id: B, code: 'DEP0002', status: 'available' }));
  uow.properties.rows.set(
    C,
    propertySnapshot({
      id: C,
      code: 'DEP0003',
      producerUserId: OTHER_USER_ID,
      branchId: OTHER_BRANCH,
    }),
  );
  const list = new StubPanelPropertyListQuery({
    items: [
      aPanelItem({ id: A, code: 'DEP0001' }),
      aPanelItem({ id: B, code: 'DEP0002' }),
      aPanelItem({ id: C, code: 'DEP0003' }),
    ],
    total: 3,
  });
  const producers = new InMemoryProducers(new Map([[NEW_PRODUCER, { branchId: OTHER_BRANCH }]]));
  const clock = new FixedClock(TEST_NOW);
  return { uow, list, bulk: new BulkEditProperties({ uow, list, producers, clock }) };
}

const ALL = { kind: 'filter', filter: {} } as const;

describe('BulkEditProperties', () => {
  it('changes the status of the properties the actor can edit and skips the rest', async () => {
    const { uow, bulk } = setup();
    const result = unwrap(
      await bulk.execute({ selection: ALL, change: { field: 'status', status: 'paused' } }, AGENT),
    );

    expect(result).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: [
        { code: 'DEP0001', reason: 'invalid_transition' },
        { code: 'DEP0003', reason: 'forbidden' },
      ],
      skippedCount: 2,
    });
    expect(uow.properties.rows.get(B)?.status).toBe('paused');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'property.status_changed',
        entityId: B,
        changes: { status: { before: 'available', after: 'paused' } },
      }),
    ]);
    expect(uow.events.published.map((e) => e.type)).toEqual(['properties.property_status_changed']);
  });

  it('changes the price of the selected properties and keeps the price history', async () => {
    const { uow, bulk } = setup();
    const result = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'ids', ids: [A, B] },
          change: { field: 'price', operation: 'sale', currency: 'USD', price: '115000' },
        },
        AGENT,
      ),
    );
    expect(result.updated).toBe(2);
    expect(uow.properties.rows.get(A)?.operations).toEqual([
      { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
    ]);
    expect(uow.properties.priceChanges).toHaveLength(2);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'updated',
      action: 'property.updated',
      changes: {
        operations: {
          before: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
          after: [{ operation: 'sale', currency: 'USD', priceCents: 11_500_000n }],
        },
      },
    });
  });

  it('skips the properties without that operation', async () => {
    const { bulk } = setup();
    const result = unwrap(
      await bulk.execute(
        {
          selection: { kind: 'ids', ids: [A] },
          change: { field: 'price', operation: 'rent', currency: 'ARS', price: '900000' },
        },
        AGENT,
      ),
    );
    expect(result.skipped).toEqual([{ code: 'DEP0001', reason: 'operation_not_found' }]);
  });

  it('reassigns the producer with its branch, with the permission to do it', async () => {
    const { uow, bulk } = setup();
    const input: BulkEditPropertiesInput = {
      selection: { kind: 'ids', ids: [C] },
      change: { field: 'producer', userId: NEW_PRODUCER },
    };
    expect(unwrapErr(await bulk.execute(input, AGENT))).toEqual({ type: 'Forbidden' });

    expect(unwrap(await bulk.execute(input, MANAGER)).updated).toBe(1);
    expect(uow.properties.rows.get(C)).toMatchObject({
      producerUserId: NEW_PRODUCER,
      branchId: OTHER_BRANCH,
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.producer_changed',
      changes: { producerUserId: { before: OTHER_USER_ID, after: NEW_PRODUCER } },
    });
  });

  it('rejects an inactive or unknown producer', async () => {
    const { bulk } = setup();
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: ALL, change: { field: 'producer', userId: PRODUCER_ID } },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'ProducerNotFound' });
  });

  it('marks available only with properties:mark-available', async () => {
    const { bulk } = setup();
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: ALL, change: { field: 'status', status: 'available' } },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('adds tags that exist and counts the properties that already had them', async () => {
    const { uow, bulk } = setup();
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: { kind: 'ids', ids: [A] }, change: { field: 'tags', add: [TAG] } },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'TagNotFound' });

    uow.tags.rows.set(TAG, {
      id: unwrap(parseId<'PropertyTag'>(TAG)),
      groupId: undefined,
      name: 'Destacar',
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const first = unwrap(
      await bulk.execute(
        { selection: { kind: 'ids', ids: [A] }, change: { field: 'tags', add: [TAG] } },
        AGENT,
      ),
    );
    const second = unwrap(
      await bulk.execute(
        { selection: { kind: 'ids', ids: [A] }, change: { field: 'tags', add: [TAG] } },
        AGENT,
      ),
    );
    expect([first.updated, second.unchanged]).toEqual([1, 1]);
    expect(uow.properties.rows.get(A)?.tagIds).toEqual([TAG]);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.tags_changed',
      changes: { tagIds: { before: [], after: [TAG] } },
    });
  });

  it('works in batches and refuses selections that are too big', async () => {
    const { uow, list, bulk } = setup();
    unwrap(
      await bulk.execute(
        { selection: ALL, change: { field: 'status', status: 'paused' } },
        MANAGER,
      ),
    );
    expect(uow.transactions).toBe(1);

    const huge = new BulkEditProperties({
      uow,
      list: new StubPanelPropertyListQuery({ items: [], total: MAX_BULK_EDIT + 1 }),
      producers: new InMemoryProducers(),
      clock: new FixedClock(TEST_NOW),
    });
    expect(
      unwrapErr(
        await huge.execute(
          { selection: ALL, change: { field: 'status', status: 'paused' } },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'TooManyProperties', max: MAX_BULK_EDIT, total: MAX_BULK_EDIT + 1 });
    expect(list.calls).toEqual([]);
  });

  it('needs properties:bulk-edit', async () => {
    const { bulk } = setup();
    expect(
      unwrapErr(
        await bulk.execute(
          { selection: ALL, change: { field: 'status', status: 'paused' } },
          TEST_OUTSIDER,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('ExportProperties', () => {
  function exporter(total = 3) {
    const uow = new InMemoryPropertiesUnitOfWork();
    const items = [A, B, C].map((id, i) => aPanelItem({ id, code: `DEP000${i + 1}` }));
    const list = new StubPanelPropertyListQuery({ items, total });
    const writer = new FakeExportWriter();
    const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']]));
    const clock = new FixedClock(TEST_NOW);
    return {
      uow,
      list,
      writer,
      exportProperties: new ExportProperties({ uow, list, users, writer, clock }),
    };
  }

  it('writes the rows in batches and audits the export with its filter', async () => {
    const { uow, writer, exportProperties } = exporter();
    const actor = Actor.user(PRODUCER_ID, ['properties:read', 'properties:export']);

    const file = unwrap(
      await exportProperties.execute(
        { format: 'xlsx', selection: { kind: 'filter', filter: { operation: 'sale' } } },
        actor,
      ),
    );
    for await (const _chunk of file.body) {
      // La planilla se arma a medida que se lee.
    }

    expect(writer.format).toBe('xlsx');
    expect(writer.rows.map((row) => [row.code, row.producer?.name])).toEqual([
      ['DEP0001', 'Camila Ruiz'],
      ['DEP0002', 'Camila Ruiz'],
      ['DEP0003', 'Camila Ruiz'],
    ]);
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'action',
      action: 'property.exported',
      entityType: 'property_export',
      changes: {
        format: { before: null, after: 'xlsx' },
        count: { before: null, after: 3 },
        selection: { before: null, after: { kind: 'filter', filter: { operation: 'sale' } } },
      },
    });
  });

  it('needs properties:export-bulk for more than ten properties', async () => {
    const { exportProperties, uow } = exporter(11);
    const selection = { kind: 'filter', filter: {} } as const;
    const limited = Actor.user(PRODUCER_ID, ['properties:read', 'properties:export']);
    expect(
      unwrapErr(await exportProperties.execute({ format: 'csv', selection }, limited)),
    ).toEqual({
      type: 'Forbidden',
    });
    expect(uow.audit.entries).toEqual([]);

    const bulk = Actor.user(PRODUCER_ID, ['properties:read', 'properties:export-bulk']);
    expect((await exportProperties.execute({ format: 'csv', selection }, bulk)).isOk()).toBe(true);
  });

  it('limits the PDF and refuses an empty export', async () => {
    const actor = Actor.user(PRODUCER_ID, ['properties:export-bulk']);
    const selection = { kind: 'filter', filter: {} } as const;
    const big = exporter(MAX_PDF_EXPORT_ROWS + 1);
    expect(
      unwrapErr(await big.exportProperties.execute({ format: 'pdf', selection }, actor)),
    ).toEqual({
      type: 'TooManyToExport',
      max: MAX_PDF_EXPORT_ROWS,
      total: MAX_PDF_EXPORT_ROWS + 1,
    });
    const empty = exporter(0);
    expect(
      unwrapErr(await empty.exportProperties.execute({ format: 'csv', selection }, actor)),
    ).toEqual({ type: 'NothingToExport' });
  });

  it('needs an export permission', async () => {
    const { exportProperties } = exporter();
    expect(
      unwrapErr(
        await exportProperties.execute(
          { format: 'csv', selection: { kind: 'ids', ids: [A] } },
          Actor.user(PRODUCER_ID, ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});
