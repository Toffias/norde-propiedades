import { describe, expect, it } from 'vitest';

import { CompanySettings } from '../../../settings';
import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_LIST_DOCUMENT_PROPERTIES } from '../../domain/property-sheet';
import {
  aPanelItem,
  FakeSheetRenderer,
  FakeStaticMaps,
  InMemoryDocumentContacts,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  propertySnapshot,
  StubPanelPropertyListQuery,
  StubPropertyDetailLookups,
  TEST_NOW,
} from '../../testing';
import { GetPdfExportOptions } from '../queries/get-pdf-export-options';
import { GetPropertyListDocumentDownload } from '../queries/get-property-list-document-download';
import { RenderPropertyListDocument } from './render-property-list-document';
import { RequestPropertyListDocument } from './request-property-list-document';

const A = '00000000-0000-7000-8000-0000000000c1';
const B = '00000000-0000-7000-8000-0000000000c2';
const C = '00000000-0000-7000-8000-0000000000c3';

const EXPORTER = Actor.user(PRODUCER_ID, ['properties:read', 'properties:export']);
const BULK = Actor.user(OTHER_USER_ID, ['properties:read', 'properties:export-bulk']);
const JOBS = Actor.system('scheduler', ['properties:render-documents', 'properties:read']);

const MAIN_BRANCH = {
  name: 'Casa central',
  address: 'Av. Alberdi 6885',
  phone: '+541146871674',
  whatsapp: '+5491161798942',
  email: 'hola@norde.com.ar',
};

function settingsWith(pdf: { agentInfo?: 'show' | 'hide' | 'ask' } = {}) {
  const settings = CompanySettings.defaults();
  settings.updatePdfOptions({ ...settings.toSnapshot().pdfOptions, ...pdf }, TEST_NOW);
  return { get: () => Promise.resolve(settings) };
}

function setup(total = 3, pdf: { agentInfo?: 'show' | 'hide' | 'ask' } = {}) {
  const uow = new InMemoryPropertiesUnitOfWork();
  // El buscador devuelve las propiedades ordenadas por código.
  const items = [A, B, C].map((id, i) => aPanelItem({ id, code: `DEP000${(i + 1).toString()}` }));
  for (const item of items) {
    uow.properties.rows.set(item.id, propertySnapshot({ id: item.id, code: item.code }));
  }
  const list = new StubPanelPropertyListQuery({ items, total });
  const settings = settingsWith(pdf);
  const storage = new InMemoryFileStorage();
  const renderer = new FakeSheetRenderer();
  const maps = new FakeStaticMaps();
  const clock = new FixedClock(TEST_NOW);
  const contacts = new InMemoryDocumentContacts(
    new Map([['main', MAIN_BRANCH]]),
    new Map([
      [
        PRODUCER_ID,
        {
          name: 'Camila Ruiz',
          address: undefined,
          phone: '+5491155550000',
          whatsapp: undefined,
          email: 'camila@norde.com.ar',
        },
      ],
    ]),
  );
  const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']]));
  return {
    uow,
    renderer,
    maps,
    request: new RequestPropertyListDocument({
      uow,
      list,
      settings,
      ids: new SequentialIdGenerator(),
      clock,
    }),
    render: new RenderPropertyListDocument({
      uow,
      lookups: new StubPropertyDetailLookups(),
      users,
      storage,
      settings,
      renderer,
      maps,
      contacts,
      clock,
    }),
    download: new GetPropertyListDocumentDownload({ uow, storage }),
    options: new GetPdfExportOptions({ settings }),
  };
}

const ALL = { kind: 'filter', filter: {} } as const;

describe('RequestPropertyListDocument', () => {
  it('fixes the selection ordered by code, audits the export and asks the job for the PDF', async () => {
    const { request, uow } = setup();
    const { documentId } = unwrap(
      await request.execute({ selection: ALL, layout: 'grid' }, EXPORTER),
    );

    const document = uow.listDocuments.rows.get(documentId);
    expect(document).toMatchObject({
      propertyIds: [A, B, C],
      layout: 'grid',
      includeAgent: true,
      status: 'pending',
      requestedBy: PRODUCER_ID,
    });
    expect(uow.events.published).toMatchObject([
      {
        type: 'properties.list_document_requested',
        payload: { documentId, layout: 'grid', count: 3 },
      },
    ]);
    expect(uow.audit.entries).toMatchObject([
      {
        action: 'property.exported',
        entityType: 'property_export',
        entityId: documentId,
        changes: {
          format: { before: null, after: 'pdf' },
          layout: { before: null, after: 'grid' },
          count: { before: null, after: 3 },
        },
      },
    ]);
  });

  it('needs properties:export-bulk for more than ten and prints at most a hundred', async () => {
    expect(
      unwrapErr(await setup(11).request.execute({ selection: ALL, layout: 'landscape' }, EXPORTER)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await setup(MAX_LIST_DOCUMENT_PROPERTIES + 1).request.execute(
          { selection: ALL, layout: 'landscape' },
          BULK,
        ),
      ),
    ).toEqual({
      type: 'TooManyToExport',
      max: MAX_LIST_DOCUMENT_PROPERTIES,
      total: MAX_LIST_DOCUMENT_PROPERTIES + 1,
    });
    expect(
      unwrapErr(await setup(0).request.execute({ selection: ALL, layout: 'landscape' }, BULK)),
    ).toEqual({ type: 'NothingToExport' });
  });

  it('needs an export permission and a known layout', async () => {
    const { request } = setup();
    expect(
      unwrapErr(
        await request.execute(
          { selection: ALL, layout: 'landscape' },
          Actor.user(PRODUCER_ID, ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await request.execute(
          // @ts-expect-error: un formato que no existe llega desde afuera sin tipos.
          { selection: ALL, layout: 'poster' },
          EXPORTER,
        ),
      ).type,
    ).toBe('InvalidInput');
  });

  it('asks for the agent details only when "Ficha y PDF" says so', async () => {
    const ask = setup(3, { agentInfo: 'ask' });
    const chosen = unwrap(
      await ask.request.execute(
        { selection: ALL, layout: 'portrait', includeAgent: false },
        EXPORTER,
      ),
    );
    expect(ask.uow.listDocuments.rows.get(chosen.documentId)?.includeAgent).toBe(false);

    const hide = setup(3, { agentInfo: 'hide' });
    const forced = unwrap(
      await hide.request.execute(
        { selection: ALL, layout: 'portrait', includeAgent: true },
        EXPORTER,
      ),
    );
    expect(hide.uow.listDocuments.rows.get(forced.documentId)?.includeAgent).toBe(false);
  });
});

describe('RenderPropertyListDocument', () => {
  it('prints every property in order with the company contact and the agent', async () => {
    const { request, render, renderer, uow, download } = setup();
    const { documentId } = unwrap(
      await request.execute({ selection: ALL, layout: 'landscape' }, EXPORTER),
    );

    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('ready');
    const content = renderer.rendered[0];
    expect(content).toMatchObject({
      layout: 'landscape',
      title: 'Propiedades seleccionadas',
      company: { name: CompanySettings.defaults().name, contact: MAIN_BRANCH },
      agent: { name: 'Camila Ruiz' },
    });
    expect(content?.sheets.map((sheet) => sheet.property.code)).toEqual([
      'DEP0001',
      'DEP0002',
      'DEP0003',
    ]);
    expect(uow.listDocuments.rows.get(documentId)).toMatchObject({
      status: 'ready',
      storageKey: `properties/exports/${documentId}`,
    });
    expect(unwrap(await download.execute({ documentId }, EXPORTER))).toMatchObject({
      kind: 'content',
      fileName: 'propiedades-2026-10-01.pdf',
      contentType: 'application/pdf',
    });
    // Ya armado: un segundo aviso del job no lo vuelve a armar.
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('gone');
  });

  it('skips the properties deleted after the request, and fails when none is left', async () => {
    const some = setup();
    const first = unwrap(
      await some.request.execute({ selection: ALL, layout: 'portrait' }, EXPORTER),
    );
    some.uow.properties.rows.delete(B);
    expect(unwrap(await some.render.execute(first, JOBS))).toBe('ready');
    expect(some.renderer.rendered[0]?.sheets.map((sheet) => sheet.property.id)).toEqual([A, C]);

    const none = setup();
    const second = unwrap(
      await none.request.execute({ selection: ALL, layout: 'portrait' }, EXPORTER),
    );
    none.uow.properties.rows.clear();
    expect(unwrap(await none.render.execute(second, JOBS))).toBe('failed');
    expect(none.uow.listDocuments.rows.get(second.documentId)?.error).toBe(
      'Ninguna de las propiedades está disponible.',
    );
  });

  it('marks it failed when the PDF breaks, and lets the error reach the job', async () => {
    const { request, render, renderer, uow, download } = setup();
    renderer.fail = true;
    const { documentId } = unwrap(
      await request.execute({ selection: ALL, layout: 'grid' }, EXPORTER),
    );
    await expect(render.execute({ documentId }, JOBS)).rejects.toThrow('react-pdf exploded');
    expect(uow.listDocuments.rows.get(documentId)?.status).toBe('failed');
    expect(unwrapErr(await download.execute({ documentId }, EXPORTER))).toEqual({
      type: 'DocumentNotReady',
    });
  });

  it('is only for the jobs', async () => {
    const { request, render } = setup();
    const { documentId } = unwrap(
      await request.execute({ selection: ALL, layout: 'grid' }, EXPORTER),
    );
    expect(unwrapErr(await render.execute({ documentId }, EXPORTER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetPropertyListDocumentDownload', () => {
  it('lets the requester or a bulk exporter download it, nobody else', async () => {
    const { request, render, download } = setup();
    const { documentId } = unwrap(
      await request.execute({ selection: ALL, layout: 'grid' }, EXPORTER),
    );
    unwrap(await render.execute({ documentId }, JOBS));

    expect((await download.execute({ documentId }, BULK)).isOk()).toBe(true);
    expect(
      unwrapErr(
        await download.execute(
          { documentId },
          Actor.user(OTHER_USER_ID, ['properties:read', 'properties:export']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await download.execute({ documentId: '00000000-0000-7000-8000-0000000000ff' }, EXPORTER),
      ),
    ).toEqual({ type: 'DocumentNotFound' });
  });
});

describe('GetPdfExportOptions', () => {
  it('tells the dialog whether to ask for the agent details', async () => {
    expect(unwrap(await setup(3, { agentInfo: 'ask' }).options.execute({}, EXPORTER))).toEqual({
      askAgent: true,
    });
    expect(unwrap(await setup().options.execute({}, EXPORTER))).toEqual({ askAgent: false });
    expect(
      unwrapErr(await setup().options.execute({}, Actor.user(PRODUCER_ID, ['properties:read']))),
    ).toEqual({ type: 'Forbidden' });
  });
});
