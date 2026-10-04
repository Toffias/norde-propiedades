import { describe, expect, it } from 'vitest';

import { parseId } from '../../../shared';
import { InMemoryCompanySettingsRepository, InMemoryFileStorage } from '../../../settings/testing';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { appraisalPhotoKey } from '../../domain/appraisal-photo';
import type { AppraisalResult } from '../../domain/appraisal-result';
import {
  APPRAISAL_ID,
  APPRAISER_ID,
  appraisalDetailItem,
  appraisalSnapshot,
  InMemoryAppraisalsUnitOfWork,
  InMemoryPanelDirectory,
  PRODUCER_ID,
  RecordingAppraisalReportRenderer,
  REQUESTER_ID,
  StubAppraisalQuery,
  TEST_APPRAISER,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { DownloadAppraisalReport } from './download-appraisal-report';

const PHOTO_IDS = ['00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000102'];

const RESULT: AppraisalResult = {
  sale: { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' },
  rent: undefined,
  comparables: [
    {
      address: 'Mitre 1500',
      priceCents: 11_800_000n,
      currency: 'USD',
      surfaceM2: 65,
      url: undefined,
      note: undefined,
    },
  ],
  observations: 'Muy luminoso.',
};

async function setup(overrides: Parameters<typeof appraisalSnapshot>[0] = {}) {
  const snapshot = appraisalSnapshot({
    status: 'appraised',
    result: RESULT,
    appraiserUserId: APPRAISER_ID,
    ...overrides,
  });
  const uow = new InMemoryAppraisalsUnitOfWork();
  uow.appraisals.rows.set(snapshot.id, snapshot);
  const storage = new InMemoryFileStorage();
  for (const [position, rawId] of PHOTO_IDS.entries()) {
    const id = unwrap(parseId<'AppraisalPhoto'>(rawId));
    const storageKey = appraisalPhotoKey(snapshot.id, id);
    await uow.photos.insert({
      id,
      appraisalId: snapshot.id,
      storageKey,
      position,
      createdAt: TEST_NOW,
    });
    // La segunda foto ya no está en el storage: se omite.
    if (position === 0) {
      await storage.put({ key: storageKey, contentType: 'image/jpeg', bytes: new Uint8Array([1]) });
    }
  }
  const settings = new InMemoryCompanySettingsRepository();
  settings.row = { ...settings.row, logoKey: 'company/logo' };
  await storage.put({ key: 'company/logo', contentType: 'image/png', bytes: new Uint8Array([9]) });
  const renderer = new RecordingAppraisalReportRenderer();
  const download = new DownloadAppraisalReport({
    uow,
    appraisals: new StubAppraisalQuery([appraisalDetailItem(snapshot)]),
    directory: new InMemoryPanelDirectory({
      user: new Map([
        [PRODUCER_ID, 'Camila Díaz'],
        [APPRAISER_ID, 'Juan Gómez'],
      ]),
      branch: new Map(),
    }),
    storage,
    settings,
    renderer,
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, renderer, download };
}

describe('DownloadAppraisalReport', () => {
  it('renders the report with the result, the photos and the company brand', async () => {
    const { renderer, download } = await setup();

    const file = unwrap(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER));

    expect(file).toEqual({
      fileName: 'Tasacion-TAS0001.pdf',
      contentType: 'application/pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    const [content] = renderer.rendered;
    expect(content?.appraisal).toMatchObject({
      code: 'TAS0001',
      requester: { id: REQUESTER_ID, name: 'Ana Pérez' },
      appraiser: { id: APPRAISER_ID, name: 'Juan Gómez' },
      result: { observations: 'Muy luminoso.' },
    });
    expect(content?.appraisal.result.comparables[0]?.pricePerM2).toEqual({
      amountCents: 181_538n,
      currency: 'USD',
    });
    expect(content?.photos).toEqual([new Uint8Array([1])]);
    expect(content?.company).toEqual({ name: 'Norde Propiedades', logo: new Uint8Array([9]) });
    expect(content?.generatedAt).toEqual(TEST_NOW);
  });

  it('records the download in the history with the requester', async () => {
    const { uow, download } = await setup();

    unwrap(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_APPRAISER));

    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'appraisal.report_downloaded',
        entityType: 'appraisal',
        entityId: APPRAISAL_ID,
        clientIds: [REQUESTER_ID],
        kind: 'action',
      }),
    ]);
  });

  it('also prints converted appraisals', async () => {
    const { download } = await setup({ status: 'converted' });
    const file = unwrap(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_MANAGER));
    expect(file.fileName).toBe('Tasacion-TAS0001.pdf');
  });

  it('rejects an appraisal that is not appraised yet', async () => {
    const { uow, renderer, download } = await setup({ status: 'visit_scheduled' });

    expect(unwrapErr(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER))).toEqual(
      { type: 'AppraisalNotReportable' },
    );
    expect(renderer.rendered).toEqual([]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an appraisal without a suggested value', async () => {
    const { download } = await setup({
      result: { sale: undefined, rent: undefined, comparables: [], observations: undefined },
    });
    expect(unwrapErr(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER))).toEqual(
      { type: 'AppraisalNotReportable' },
    );
  });

  it('hides appraisals of other agents and checks the permission', async () => {
    const { download } = await setup();
    expect(
      unwrapErr(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_OTHER_AGENT)),
    ).toEqual({ type: 'AppraisalNotFound' });
    expect(unwrapErr(await download.execute({ appraisalId: APPRAISAL_ID }, TEST_OUTSIDER))).toEqual(
      { type: 'Forbidden' },
    );
  });

  it('validates the input', async () => {
    const { download } = await setup();
    const error = unwrapErr(await download.execute({ appraisalId: 'nope' }, TEST_PRODUCER));
    expect(error.type).toBe('InvalidInput');
  });
});
