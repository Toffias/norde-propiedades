import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  APPRAISAL_ID,
  APPRAISER_ID,
  appraisalDetailItem,
  appraisalSnapshot,
  BRANCH_ID,
  InMemoryAppraisalsUnitOfWork,
  InMemoryPanelDirectory,
  PRODUCER_ID,
  RecordingAppraisalExportWriter,
  REQUESTER_ID,
  StubAppraisalQuery,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { ExportAppraisals } from './export-appraisals';

const directory = new InMemoryPanelDirectory({
  user: new Map([
    [PRODUCER_ID, 'Camila Díaz'],
    [APPRAISER_ID, 'Juan Gómez'],
  ]),
  branch: new Map([[BRANCH_ID, 'Centro']]),
});

const SALE = { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' } as const;
const ITEM = appraisalDetailItem(
  appraisalSnapshot({
    appraiserUserId: APPRAISER_ID,
    status: 'appraised',
    result: { sale: SALE, rent: undefined, comparables: [], observations: undefined },
  }),
);

/** Un productor que además puede exportar. */
const EXPORTER = Actor.user(PRODUCER_ID, ['appraisals:read', 'appraisals:export']).withBranch(
  BRANCH_ID,
);

function setup(rows = [ITEM]) {
  const uow = new InMemoryAppraisalsUnitOfWork();
  const appraisals = new StubAppraisalQuery(rows);
  const writer = new RecordingAppraisalExportWriter();
  const exporter = new ExportAppraisals({
    uow,
    appraisals,
    directory,
    writer,
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, appraisals, writer, exporter };
}

async function drain(body: AsyncIterable<Uint8Array>): Promise<number> {
  let chunks = 0;
  for await (const _chunk of body) chunks += 1;
  return chunks;
}

describe('ExportAppraisals', () => {
  it('writes the rows with names and appraised values, and audits the export', async () => {
    const { uow, appraisals, writer, exporter } = setup();

    const file = unwrap(await exporter.execute({ filter: { status: 'appraised' } }, EXPORTER));
    await drain(file.body);

    expect(file.filename).toBe('tasaciones-2026-10-01.xlsx');
    expect(writer.rows).toEqual([
      expect.objectContaining({
        id: APPRAISAL_ID,
        code: 'TAS0001',
        requester: { id: REQUESTER_ID, name: 'Ana Pérez' },
        producer: { id: PRODUCER_ID, name: 'Camila Díaz' },
        appraiser: { id: APPRAISER_ID, name: 'Juan Gómez' },
        branch: { id: BRANCH_ID, name: 'Centro' },
        sale: SALE,
        rent: undefined,
        surfaceTotalM2: 300,
      }),
    ]);
    expect(appraisals.exportRequests[0]).toMatchObject({
      visibility: { kind: 'own', ownerId: PRODUCER_ID },
      deleted: false,
      sort: { field: 'code', direction: 'asc' },
      offset: 0,
      limit: 1,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'appraisal.exported',
        entityType: 'appraisal_export',
        changes: {
          count: { before: null, after: 1 },
          filter: { before: null, after: { status: 'appraised', view: 'active' } },
        },
      }),
    ]);
  });

  it('reads in batches of 500', async () => {
    const rows = Array.from({ length: 501 }, () => ITEM);
    const { appraisals, writer, exporter } = setup(rows);

    await drain(unwrap(await exporter.execute({}, TEST_MANAGER)).body);

    expect(appraisals.exportRequests.map((r) => [r.offset, r.limit])).toEqual([
      [0, 500],
      [500, 1],
    ]);
    expect(writer.rows).toHaveLength(501);
  });

  it('reports an empty selection', async () => {
    const { exporter } = setup([]);
    expect(unwrapErr(await exporter.execute({}, EXPORTER))).toEqual({ type: 'NothingToExport' });
  });

  it('needs appraisals:export, and appraisals:delete for the trash', async () => {
    const { uow, exporter } = setup();
    expect(unwrapErr(await exporter.execute({}, TEST_PRODUCER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await exporter.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await exporter.execute({ filter: { view: 'trash' } }, EXPORTER))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects invalid filters', async () => {
    const { exporter } = setup();
    const error = unwrapErr(
      await exporter.execute(
        { filter: { createdFrom: '2026-10-10', createdTo: '2026-10-01' } },
        EXPORTER,
      ),
    );
    expect(error.type).toBe('InvalidInput');
  });
});
