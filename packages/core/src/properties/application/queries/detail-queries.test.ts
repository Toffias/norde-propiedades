import { describe, expect, it } from 'vitest';

import { InMemoryAuditHistoryQuery } from '../../../audit/testing';
import { CompanySettings } from '../../../settings';
import { InMemoryFileStorage, RecordingMailer } from '../../../settings/testing';
import { Actor, err, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  FakeDocumentRenderer,
  InMemoryPropertiesUnitOfWork,
  InMemoryPropertyDocumentQuery,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  StubOwnerReports,
  StubPropertyDetailLookups,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { MediaItem } from '../../domain/media-item';
import { RenderPropertyDocument } from '../commands/render-property-document';
import { RequestPropertyDocument } from '../commands/request-property-document';
import { SendOwnerReport } from '../commands/send-owner-report';
import { GetPanelPropertyDetail } from './get-panel-property-detail';
import { GetPropertyDocumentDownload } from './get-property-document-download';
import { GetPropertyInterestProfile } from './get-property-interest-profile';
import { GetPropertyInterestProfiles } from './get-property-interest-profiles';
import { ListPropertyDocuments } from './list-property-documents';
import { ListPropertyHistory } from './list-property-history';

const READER = Actor.user(PRODUCER_ID, [
  'properties:read',
  'properties:export',
  'audit:read',
]).withBranch(BRANCH_ID);
/** Ve el historial de cualquiera. */
const AUDITOR = Actor.user(OTHER_USER_ID, ['properties:read', 'audit:read', 'audit:read-others']);
/** Ve propiedades, pero solo el historial de lo suyo. */
const OWN_AUDIT = Actor.user(OTHER_USER_ID, ['properties:read', 'audit:read']);
const JOBS = Actor.system('scheduler', ['properties:render-documents', 'properties:read']);

function settingsReader() {
  const settings = CompanySettings.defaults();
  return { get: () => Promise.resolve(settings) };
}

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(
    PROPERTY_ID,
    propertySnapshot({
      characteristics: { ...propertySnapshot().characteristics, rooms: 3 },
      internal: { ...propertySnapshot().internal, appraiserUserIds: [OTHER_USER_ID] },
    }),
  );
  const users = new InMemoryUserNames(
    new Map([
      [PRODUCER_ID, 'Camila Ruiz'],
      [OTHER_USER_ID, 'Martín Gómez'],
    ]),
  );
  return { uow, users, lookups: new StubPropertyDetailLookups(), clock: new FixedClock(TEST_NOW) };
}

describe('GetPanelPropertyDetail', () => {
  it('builds the detail page with names, including drafts', async () => {
    const { uow, users, lookups } = setup();
    lookups.owners_ = [{ id: 'client-1', name: 'Ana Pérez' }];
    const detail = unwrap(
      await new GetPanelPropertyDetail({ uow, lookups, users }).execute(
        { propertyId: PROPERTY_ID },
        READER,
      ),
    );
    expect(detail).toMatchObject({
      code: 'DEP0001',
      status: 'draft',
      isPubliclyListed: false,
      producer: { id: PRODUCER_ID, name: 'Camila Ruiz' },
      createdBy: { id: PRODUCER_ID, name: 'Camila Ruiz' },
      internal: { appraisers: [{ id: OTHER_USER_ID, name: 'Martín Gómez' }] },
      owners: [{ id: 'client-1', name: 'Ana Pérez' }],
      characteristics: { rooms: 3 },
    });
  });

  it('reports a missing property and needs the read permission', async () => {
    const { uow, users, lookups } = setup();
    const query = new GetPanelPropertyDetail({ uow, lookups, users });
    expect(
      unwrapErr(
        await query.execute({ propertyId: '00000000-0000-7000-8000-0000000000ff' }, READER),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(unwrapErr(await query.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ListPropertyHistory', () => {
  function history() {
    const entry = (
      id: string,
      action: string,
      changes: Record<string, { before: string | null; after: string | null }>,
      day: number,
    ) => ({
      id,
      entityType: 'property',
      entityId: PROPERTY_ID,
      occurredAt: new Date(Date.UTC(2026, 8, day, 15)),
      actorId: PRODUCER_ID,
      source: 'gestion',
      action,
      changes,
    });
    return new InMemoryAuditHistoryQuery([
      entry('a1', 'property.created', { code: { before: null, after: 'DEP0001' } }, 1),
      entry('a2', 'property.updated', { operations: { before: 'x', after: 'y' } }, 5),
      entry(
        'a3',
        'property.status_changed',
        { status: { before: 'draft', after: 'available' } },
        9,
      ),
      entry(
        'a4',
        'property.media_added',
        { 'media.m1.kind': { before: null, after: 'photo' } },
        12,
      ),
    ]);
  }

  it('pages the history newest first with the author name', async () => {
    const { uow, users } = setup();
    const page = unwrap(
      await new ListPropertyHistory({ uow, history: history(), users }).execute(
        { propertyId: PROPERTY_ID, pageSize: 2 },
        READER,
      ),
    );
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.id)).toEqual(['a4', 'a3']);
    expect(page.items[0]?.actor).toEqual({ id: PRODUCER_ID, name: 'Camila Ruiz' });
  });

  it('filters by kind of change and by dates of Buenos Aires', async () => {
    const { uow, users } = setup();
    const query = new ListPropertyHistory({ uow, history: history(), users });
    const price = unwrap(
      await query.execute({ propertyId: PROPERTY_ID, category: 'price' }, READER),
    );
    expect(price.items.map((item) => item.id)).toEqual(['a2']);
    const media = unwrap(
      await query.execute({ propertyId: PROPERTY_ID, category: 'media' }, READER),
    );
    expect(media.items.map((item) => item.id)).toEqual(['a4']);
    const range = unwrap(
      await query.execute(
        { propertyId: PROPERTY_ID, from: '2026-09-05', to: '2026-09-09' },
        READER,
      ),
    );
    expect(range.items.map((item) => item.id)).toEqual(['a3', 'a2']);
  });

  it('shows the history of others only with "ver el historial de otros"', async () => {
    const { uow, users } = setup();
    const query = new ListPropertyHistory({ uow, history: history(), users });
    expect(unwrapErr(await query.execute({ propertyId: PROPERTY_ID }, OWN_AUDIT))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await query.execute({ propertyId: PROPERTY_ID }, AUDITOR));
    expect(
      unwrapErr(
        await query.execute(
          { propertyId: PROPERTY_ID },
          Actor.user(PRODUCER_ID, ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('GetPropertyInterestProfile', () => {
  it('returns what the saved searches compare, without the prices on request', async () => {
    const { uow } = setup();
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({
        operations: [
          {
            operation: 'sale',
            currency: 'USD',
            priceCents: 12_000_000n,
            priceOnRequest: true,
            commissionPct: undefined,
          },
        ],
      }),
    );
    const profile = unwrap(
      await new GetPropertyInterestProfile({ uow }).execute({ propertyId: PROPERTY_ID }, READER),
    );
    expect(profile).toEqual({
      propertyId: PROPERTY_ID,
      propertyType: 'apartment',
      operations: [{ operation: 'sale', currency: 'USD', priceCents: undefined }],
      locationIds: [],
      rooms: undefined,
    });
  });
});

describe('GetPropertyInterestProfiles', () => {
  it('returns the profiles of the properties that exist, once each', async () => {
    const { uow } = setup();
    const query = new GetPropertyInterestProfiles({ uow });
    const profiles = unwrap(
      await query.execute(
        {
          propertyIds: [
            PROPERTY_ID,
            PROPERTY_ID.toUpperCase(),
            '00000000-0000-7000-8000-0000000000c9',
          ],
        },
        READER,
      ),
    );
    expect(profiles.map((p) => p.propertyId)).toEqual([PROPERTY_ID]);
    expect(profiles[0]?.rooms).toBe(3);
  });

  it('needs to read properties and validates the input', async () => {
    const { uow } = setup();
    const query = new GetPropertyInterestProfiles({ uow });
    const noRead = Actor.user(PRODUCER_ID, ['audit:read']);
    expect(await query.execute({ propertyIds: [PROPERTY_ID] }, noRead)).toEqual(
      err({ type: 'Forbidden' }),
    );
    const tooMany = Array.from({ length: 51 }, () => PROPERTY_ID);
    const result = await query.execute({ propertyIds: tooMany }, READER);
    expect(result.isErr() && result.error.type).toBe('InvalidInput');
  });
});

describe('property documents', () => {
  function documents() {
    const ctx = setup();
    const storage = new InMemoryFileStorage();
    const renderer = new FakeDocumentRenderer();
    const ownerReports = new StubOwnerReports();
    const mailer = new RecordingMailer();
    const settings = settingsReader();
    return {
      ...ctx,
      storage,
      renderer,
      ownerReports,
      mailer,
      request: new RequestPropertyDocument({
        uow: ctx.uow,
        ids: new SequentialIdGenerator(),
        clock: ctx.clock,
      }),
      render: new RenderPropertyDocument({
        uow: ctx.uow,
        lookups: ctx.lookups,
        users: ctx.users,
        storage,
        settings,
        renderer,
        ownerReports,
        clock: ctx.clock,
      }),
      send: new SendOwnerReport({ uow: ctx.uow, storage, mailer, settings }),
      download: new GetPropertyDocumentDownload({ uow: ctx.uow, storage }),
      list: new ListPropertyDocuments({
        documents: new InMemoryPropertyDocumentQuery(ctx.uow.documents),
        users: ctx.users,
      }),
    };
  }

  it('requests the sheet, audits the export and asks the job to render it', async () => {
    const { request, uow, list } = documents();
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER),
    );
    expect(uow.events.published).toMatchObject([
      { type: 'properties.document_requested', payload: { documentId, kind: 'sheet' } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.exported',
      entityId: PROPERTY_ID,
      changes: { kind: { before: null, after: 'sheet' } },
    });
    const page = unwrap(await list.execute({ propertyId: PROPERTY_ID }, READER));
    expect(page.items).toMatchObject([
      { id: documentId, status: 'pending', requestedBy: { name: 'Camila Ruiz' } },
    ]);
  });

  it('needs the export permission', async () => {
    const { request } = documents();
    expect(
      unwrapErr(
        await request.execute(
          { propertyId: PROPERTY_ID, kind: 'sheet' },
          Actor.user(PRODUCER_ID, ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('renders with the PDF options: address, prices and the photos marked for the PDF', async () => {
    const { request, render, renderer, uow, storage, download } = documents();
    const photo = (position: number, includeInPdf: boolean) => {
      const id = unwrap(
        parseId<'MediaItem'>(
          `00000000-0000-7000-8000-00000000f0${position.toString().padStart(2, '0')}`,
        ),
      );
      const item = unwrap(
        MediaItem.upload({
          id,
          propertyId: unwrap(parseId<'Property'>(PROPERTY_ID)),
          storageKey: `properties/${PROPERTY_ID}/media/${id}/original`,
          contentType: 'image/jpeg',
          sizeBytes: 1,
          position,
          isCover: position === 0,
          uploadedBy: PRODUCER_ID,
          now: TEST_NOW,
        }),
      );
      if (!includeInPdf) unwrap(item.update({ includeInPdf: false }, TEST_NOW));
      uow.media.rows.set(id, item.toSnapshot());
      return item;
    };
    const first = photo(0, true);
    photo(1, false);
    await storage.put({
      key: first.storageKey ?? '',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([7]),
    });

    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER),
    );
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('ready');
    const content = renderer.rendered[0];
    expect(content).toMatchObject({
      kind: 'sheet',
      // "Ficha y PDF" de partida: al descargar, la dirección completa.
      address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
      prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
      agentName: 'Camila Ruiz',
      company: { name: CompanySettings.defaults().name },
    });
    expect(content?.photos).toEqual([new Uint8Array([7])]);
    expect(uow.documents.rows.get(documentId)?.status).toBe('ready');
    expect(unwrap(await download.execute({ documentId }, READER))).toMatchObject({
      kind: 'content',
      fileName: 'ficha-dep0001.pdf',
      contentType: 'application/pdf',
    });
    // Ya armado: un segundo aviso del job no lo vuelve a armar.
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('gone');
  });

  it('marks the document failed when the PDF breaks, and lets the error reach the job', async () => {
    const { request, render, renderer, uow, download } = documents();
    renderer.fail = true;
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'showcase' }, READER),
    );
    await expect(render.execute({ documentId }, JOBS)).rejects.toThrow('pdf-lib exploded');
    expect(uow.documents.rows.get(documentId)?.status).toBe('failed');
    expect(unwrapErr(await download.execute({ documentId }, READER))).toEqual({
      type: 'DocumentNotReady',
    });
  });

  it('renders the owner report of the period and emails it with the PDF attached', async () => {
    const { request, render, renderer, send, mailer, uow } = documents();
    const { documentId } = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'owner_report', from: '2026-09-01', to: '2026-09-30' },
        READER,
      ),
    );
    unwrap(await render.execute({ documentId }, JOBS));
    expect(renderer.rendered[0]?.ownerReport).toMatchObject({ emailSends: 2, inquiries: 4 });

    unwrap(await send.execute({ documentId, to: 'propietario@example.com' }, READER));
    expect(mailer.sent).toMatchObject([
      {
        to: 'propietario@example.com',
        subject: 'Reporte de su propiedad DEP0001 (2026-09-01 al 2026-09-30)',
        attachments: [{ fileName: 'reporte-dep0001.pdf', contentType: 'application/pdf' }],
      },
    ]);
    const sent = uow.audit.entries.at(-1);
    expect(sent).toMatchObject({ action: 'property.owner_report_sent' });
    // El email del propietario no queda en el historial.
    expect(JSON.stringify(sent)).not.toContain('propietario@');
  });

  it('fails the owner report when the period has no report, and only sends owner reports', async () => {
    const { request, render, send, ownerReports, uow } = documents();
    ownerReports.report = undefined;
    const report = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'owner_report', from: '2026-09-01', to: '2026-09-30' },
        READER,
      ),
    );
    expect(unwrap(await render.execute(report, JOBS))).toBe('failed');
    expect(unwrapErr(await send.execute({ ...report, to: 'a@example.com' }, READER))).toEqual({
      type: 'DocumentNotReady',
    });
    const sheet = unwrap(await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER));
    expect(unwrapErr(await send.execute({ ...sheet, to: 'a@example.com' }, READER))).toEqual({
      type: 'DocumentNotFound',
    });
    expect(uow.documents.rows.size).toBe(2);
  });

  it('rejects an owner report without a valid period', async () => {
    const { request } = documents();
    const result = await request.execute(
      { propertyId: PROPERTY_ID, kind: 'owner_report', from: '2026-09-30', to: '2026-09-01' },
      READER,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
  });
});
