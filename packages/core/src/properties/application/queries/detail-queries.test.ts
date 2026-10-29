import { describe, expect, it } from 'vitest';

import { InMemoryAuditHistoryQuery } from '../../../audit/testing';
import { CompanySettings, WebUrlTemplate } from '../../../settings';
import { InMemoryFileStorage, RecordingMailer } from '../../../settings/testing';
import { Actor, err, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  DEVELOPMENT_ID,
  FakeOwnerReportRenderer,
  FakeSheetRenderer,
  FakeShowcaseRenderer,
  FakeStaticMaps,
  InMemoryPropertiesUnitOfWork,
  InMemoryPropertyDocumentQuery,
  InMemoryDocumentContacts,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  StubOwnerReports,
  StubPropertyDetailLookups,
  TEST_NOW,
  TEST_OUTSIDER,
  FakeAppraisalSheetRenderer,
  InMemoryOwnerContacts,
  StubPropertyCatalogQuery,
} from '../../testing';
import { Coordinates } from '../../domain/coordinates';
import { MediaItem } from '../../domain/media-item';
import { DEFAULT_SHOWCASE_OPTIONS } from '../../domain/showcase-options';
import type { MediaOwner } from '../../domain/media-owner';
import {
  APPRAISAL_SHEET_FEATURES_PER_KIND,
  DownloadPropertyAppraisalSheet,
} from '../commands/download-property-appraisal-sheet';
import { RenderPropertyDocument } from '../commands/render-property-document';
import { RequestPropertyDocument } from '../commands/request-property-document';
import { SendOwnerReport } from '../commands/send-owner-report';
import { GetPanelPropertyDetail } from './get-panel-property-detail';
import { GetPropertyDocumentDownload } from './get-property-document-download';
import { GetPropertyFollowUpProfile } from './get-property-follow-up-profile';
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

function settingsReader(
  developmentPhotosInUnits = true,
  pdf: { agentInfo?: 'show' | 'hide' | 'ask'; showCompanyContact?: boolean } = {},
) {
  const settings = CompanySettings.defaults();
  settings.updatePdfOptions(
    { ...settings.toSnapshot().pdfOptions, developmentPhotosInUnits, ...pdf },
    TEST_NOW,
  );
  const general = settings.toSnapshot();
  unwrap(
    settings.updateGeneral(
      {
        name: general.name,
        timezone: general.timezone,
        webPropertyUrlTemplate: unwrap(
          WebUrlTemplate.create('https://norde.com.ar/propiedades/{slug}'),
        ),
        webDevelopmentUrlTemplate: undefined,
        newsScope: general.newsScope,
      },
      TEST_NOW,
    ),
  );
  return { get: () => Promise.resolve(settings) };
}

const BRANCH_CONTACT = {
  name: 'Casa central',
  address: 'Av. Santa Fe 1234',
  phone: '+541148001234',
  whatsapp: '+5491166899124',
  email: 'hola@norde.com.ar',
};

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

describe('GetPropertyFollowUpProfile', () => {
  const AVAILABLE_SINCE = new Date('2026-10-01T12:00:00Z');

  it('says whether the site shows it and since when it is available', async () => {
    const { uow } = setup();
    const base = propertySnapshot();
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({
        status: 'available',
        statusChangedAt: AVAILABLE_SINCE,
        publication: { ...base.publication, publishedOnWeb: true },
      }),
    );
    const query = new GetPropertyFollowUpProfile({ uow });
    const profile = unwrap(await query.execute({ propertyId: PROPERTY_ID }, READER));
    expect(profile).toMatchObject({
      propertyId: PROPERTY_ID,
      propertyType: 'apartment',
      listed: true,
      listedSince: AVAILABLE_SINCE,
    });
  });

  it('is not listed while unpublished or not available', async () => {
    const { uow } = setup();
    const base = propertySnapshot();
    const query = new GetPropertyFollowUpProfile({ uow });
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({ status: 'available', statusChangedAt: AVAILABLE_SINCE }),
    );
    expect(unwrap(await query.execute({ propertyId: PROPERTY_ID }, READER))).toMatchObject({
      listed: false,
      listedSince: AVAILABLE_SINCE,
    });
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({
        status: 'reserved',
        publication: { ...base.publication, publishedOnWeb: true },
      }),
    );
    expect(unwrap(await query.execute({ propertyId: PROPERTY_ID }, READER))).toMatchObject({
      listed: false,
      listedSince: undefined,
    });
  });

  it('does not find a deleted property and needs to read properties', async () => {
    const { uow } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot({ deletedAt: TEST_NOW }));
    const query = new GetPropertyFollowUpProfile({ uow });
    expect(unwrapErr(await query.execute({ propertyId: PROPERTY_ID }, READER))).toEqual({
      type: 'PropertyNotFound',
    });
    expect(unwrapErr(await query.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
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
  function documents(
    developmentPhotosInUnits = true,
    pdf: Parameters<typeof settingsReader>[1] = {},
  ) {
    const ctx = setup();
    const storage = new InMemoryFileStorage();
    const ownerReportRenderer = new FakeOwnerReportRenderer();
    const sheets = new FakeSheetRenderer();
    const showcases = new FakeShowcaseRenderer();
    const maps = new FakeStaticMaps();
    const ownerReports = new StubOwnerReports();
    const contacts = new InMemoryDocumentContacts(
      new Map([[BRANCH_ID, BRANCH_CONTACT]]),
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
    const mailer = new RecordingMailer();
    const settings = settingsReader(developmentPhotosInUnits, pdf);
    return {
      ...ctx,
      storage,
      ownerReportRenderer,
      sheets,
      showcases,
      maps,
      ownerReports,
      mailer,
      request: new RequestPropertyDocument({
        uow: ctx.uow,
        ids: new SequentialIdGenerator(),
        clock: ctx.clock,
        settings,
      }),
      render: new RenderPropertyDocument({
        uow: ctx.uow,
        lookups: ctx.lookups,
        users: ctx.users,
        storage,
        settings,
        ownerReportRenderer,
        sheets,
        showcases,
        maps,
        ownerReports,
        contacts,
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
    const { request, render, sheets, uow, storage, download } = documents();
    const photo = (position: number, includeInPdf: boolean) => {
      const id = unwrap(
        parseId<'MediaItem'>(
          `00000000-0000-7000-8000-00000000f0${position.toString().padStart(2, '0')}`,
        ),
      );
      const item = unwrap(
        MediaItem.upload({
          id,
          owner: { kind: 'property', id: unwrap(parseId<'Property'>(PROPERTY_ID)) },
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
    const content = sheets.rendered[0];
    expect(content).toMatchObject({
      // Sin formato elegido, la vertical de varias hojas.
      layout: 'portrait',
      title: 'Ficha DEP0001',
      agent: { name: 'Camila Ruiz', phone: '+5491155550000', email: 'camila@norde.com.ar' },
      company: { name: CompanySettings.defaults().name, contact: BRANCH_CONTACT },
    });
    expect(content?.sheets).toHaveLength(1);
    expect(content?.sheets[0]).toMatchObject({
      // "Ficha y PDF" de partida: al descargar, la dirección completa.
      address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
      prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
      map: undefined,
      // Un borrador no está en la web: sin link.
      webUrl: undefined,
    });
    expect(content?.sheets[0]?.photos).toEqual([new Uint8Array([7])]);
    expect(uow.documents.rows.get(documentId)?.status).toBe('ready');
    expect(unwrap(await download.execute({ documentId }, READER))).toMatchObject({
      kind: 'content',
      // Como en Tokko: el código de la propiedad.
      fileName: 'DEP0001.pdf',
      contentType: 'application/pdf',
    });
    // Ya armado: un segundo aviso del job no lo vuelve a armar.
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('gone');
  });

  it.each([
    [true, [new Uint8Array([7]), new Uint8Array([8])]],
    [false, [new Uint8Array([7])]],
  ])(
    'adds the development photos to a unit sheet when Mi empresa asks for it (%s)',
    async (developmentPhotosInUnits, expected) => {
      const { request, render, sheets, uow, storage } = documents(developmentPhotosInUnits);
      const unit = uow.properties.rows.get(PROPERTY_ID);
      if (unit) uow.properties.rows.set(PROPERTY_ID, { ...unit, developmentId: DEVELOPMENT_ID });
      const photo = (owner: MediaOwner, suffix: string, bytes: number): Promise<void> => {
        const id = unwrap(parseId<'MediaItem'>(`00000000-0000-7000-8000-0000000000${suffix}`));
        const item = unwrap(
          MediaItem.upload({
            id,
            owner,
            storageKey: `${owner.kind}/${id}`,
            contentType: 'image/jpeg',
            sizeBytes: 1,
            position: 0,
            isCover: true,
            uploadedBy: PRODUCER_ID,
            now: TEST_NOW,
          }),
        );
        uow.media.rows.set(id, item.toSnapshot());
        return storage.put({
          key: item.storageKey ?? '',
          contentType: 'image/jpeg',
          bytes: new Uint8Array([bytes]),
        });
      };
      await photo({ kind: 'property', id: unwrap(parseId<'Property'>(PROPERTY_ID)) }, 'a1', 7);
      await photo(
        { kind: 'development', id: unwrap(parseId<'Development'>(DEVELOPMENT_ID)) },
        'a2',
        8,
      );

      const { documentId } = unwrap(
        await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER),
      );
      expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('ready');
      expect(sheets.rendered[0]?.sheets[0]?.photos).toEqual(expected);
    },
  );

  it('prints the sheet in the chosen layout, with the map when it has one', async () => {
    const { request, render, sheets, maps, uow } = documents();
    const row = uow.properties.rows.get(PROPERTY_ID);
    if (row) {
      uow.properties.rows.set(PROPERTY_ID, {
        ...row,
        coordinates: unwrap(Coordinates.create(-34.58, -58.43)),
      });
    }
    const { documentId } = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'sheet', layout: 'landscape_map' },
        READER,
      ),
    );
    expect(uow.audit.entries[0]?.changes).toMatchObject({
      layout: { before: null, after: 'landscape_map' },
    });
    unwrap(await render.execute({ documentId }, JOBS));
    expect(sheets.rendered[0]?.layout).toBe('landscape_map');
    expect(maps.requested).toEqual([{ latitude: -34.58, longitude: -58.43 }]);
    expect(sheets.rendered[0]?.sheets[0]?.map).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    // Sin mapa en el formato, no se pide.
    const plain = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'sheet', layout: 'landscape' },
        READER,
      ),
    );
    unwrap(await render.execute(plain, JOBS));
    expect(maps.requested).toHaveLength(1);
    expect(sheets.rendered[1]?.sheets[0]?.map).toBeUndefined();
  });

  it('prints the sheet without the map when the property has no coordinates or the map is down', async () => {
    const { request, render, sheets, maps } = documents();
    maps.down = true;
    const { documentId } = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'sheet', layout: 'portrait_map' },
        READER,
      ),
    );
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('ready');
    expect(sheets.rendered[0]?.sheets[0]?.map).toBeUndefined();
  });

  it.each([
    ['show', undefined, true],
    ['hide', true, false],
    ['ask', true, true],
    ['ask', false, false],
    ['ask', undefined, false],
  ] as const)(
    'decides the agent details with "%s" when the user asks %s',
    async (agentInfo, includeAgent, printed) => {
      const { request, render, sheets } = documents(true, { agentInfo });
      const { documentId } = unwrap(
        await request.execute(
          {
            propertyId: PROPERTY_ID,
            kind: 'sheet',
            ...(includeAgent === undefined ? {} : { includeAgent }),
          },
          READER,
        ),
      );
      unwrap(await render.execute({ documentId }, JOBS));
      expect(sheets.rendered[0]?.agent !== undefined).toBe(printed);
    },
  );

  it('leaves out the company contact when "Ficha y PDF" hides it', async () => {
    const { request, render, sheets } = documents(true, { showCompanyContact: false });
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER),
    );
    unwrap(await render.execute({ documentId }, JOBS));
    expect(sheets.rendered[0]?.company.contact).toBeUndefined();
  });

  it('marks the sheet failed when the property is gone', async () => {
    const { request, render, uow } = documents();
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'sheet' }, READER),
    );
    uow.properties.rows.delete(PROPERTY_ID);
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('failed');
    expect(uow.documents.rows.get(documentId)?.error).toBe('La propiedad ya no está disponible.');
  });

  /** Fotos "incluir en PDF" de la propiedad, con su archivo: `[7]`, `[8]`, `[9]`... */
  async function photos(
    uow: ReturnType<typeof documents>['uow'],
    storage: InMemoryFileStorage,
    total: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let position = 0; position < total; position += 1) {
      const id = unwrap(
        parseId<'MediaItem'>(
          `00000000-0000-7000-8000-00000000e0${position.toString().padStart(2, '0')}`,
        ),
      );
      const item = unwrap(
        MediaItem.upload({
          id,
          owner: { kind: 'property', id: unwrap(parseId<'Property'>(PROPERTY_ID)) },
          storageKey: `photos/${id}`,
          contentType: 'image/jpeg',
          sizeBytes: 1,
          position,
          isCover: position === 0,
          uploadedBy: PRODUCER_ID,
          now: TEST_NOW,
        }),
      );
      uow.media.rows.set(id, item.toSnapshot());
      await storage.put({
        key: item.storageKey ?? '',
        contentType: 'image/jpeg',
        bytes: new Uint8Array([7 + position]),
      });
      ids.push(id);
    }
    return ids;
  }

  function publishOnWeb(uow: ReturnType<typeof documents>['uow']): string {
    const row = uow.properties.rows.get(PROPERTY_ID);
    if (row) {
      uow.properties.rows.set(PROPERTY_ID, {
        ...row,
        status: 'available',
        publication: { ...row.publication, publishedOnWeb: true },
      });
    }
    return `https://norde.com.ar/propiedades/${row?.slug ?? ''}`;
  }

  it('prints the showcase with the brand options when none is chosen', async () => {
    const { request, render, showcases, uow, storage } = documents();
    await photos(uow, storage, 4);
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'showcase' }, READER),
    );
    expect(unwrap(await render.execute({ documentId }, JOBS))).toBe('ready');
    const content = showcases.rendered[0];
    expect(content?.options).toEqual(DEFAULT_SHOWCASE_OPTIONS);
    // Las tres primeras de la ficha.
    expect(content?.photos).toEqual([
      new Uint8Array([7]),
      new Uint8Array([8]),
      new Uint8Array([9]),
    ]);
    expect(content).toMatchObject({
      address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
      contact: BRANCH_CONTACT,
      agent: { name: 'Camila Ruiz' },
      // Un borrador no está en la web: sin QR.
      qrUrl: undefined,
    });
  });

  it('prints the showcase with the chosen options and photos, and audits the orientation', async () => {
    const { request, render, showcases, uow, storage } = documents();
    const ids = await photos(uow, storage, 4);
    const web = publishOnWeb(uow);
    const options = {
      orientation: 'landscape' as const,
      primaryColor: '#0A7B83',
      secondaryColor: '#123456',
      operationBand: false,
      photoCount: 3 as const,
      photoIds: [ids[3] ?? '', ids[1] ?? ''],
      descriptionSize: 32,
    };
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'showcase', options }, READER),
    );
    expect(uow.audit.entries[0]?.changes).toMatchObject({
      orientation: { before: null, after: 'landscape' },
    });
    unwrap(await render.execute({ documentId }, JOBS));
    const content = showcases.rendered[0];
    expect(content?.options).toEqual({
      ...options,
      primaryColor: '#0a7b83',
      qr: true,
      photoIds: [ids[3], ids[1]],
    });
    // Las elegidas primero, completadas con la primera de la ficha.
    expect(content?.photos).toEqual([
      new Uint8Array([10]),
      new Uint8Array([8]),
      new Uint8Array([7]),
    ]);
    expect(content?.qrUrl).toBe(web);
  });

  it('leaves the QR out when it is not asked for, and the contact when Mi empresa hides it', async () => {
    const { request, render, showcases, uow } = documents(true, {
      showCompanyContact: false,
      agentInfo: 'ask',
    });
    publishOnWeb(uow);
    const { documentId } = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'showcase', options: { qr: false, photoCount: 1 } },
        READER,
      ),
    );
    unwrap(await render.execute({ documentId }, JOBS));
    expect(showcases.rendered[0]).toMatchObject({
      qrUrl: undefined,
      contact: undefined,
      agent: undefined,
      photos: [],
    });
  });

  it('rejects showcase options out of range', async () => {
    const { request } = documents();
    const result = await request.execute(
      { propertyId: PROPERTY_ID, kind: 'showcase', options: { descriptionSize: 60 } },
      READER,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
    const tooMany = await request.execute(
      {
        propertyId: PROPERTY_ID,
        kind: 'showcase',
        options: {
          photoCount: 1,
          photoIds: [
            '00000000-0000-7000-8000-000000000001',
            '00000000-0000-7000-8000-000000000002',
          ],
        },
      },
      READER,
    );
    expect(unwrapErr(tooMany)).toEqual({ type: 'InvalidShowcaseOptions', field: 'photoIds' });
  });

  it('marks the document failed when the PDF breaks, and lets the error reach the job', async () => {
    const { request, render, showcases, uow, download } = documents();
    showcases.fail = true;
    const { documentId } = unwrap(
      await request.execute({ propertyId: PROPERTY_ID, kind: 'showcase' }, READER),
    );
    await expect(render.execute({ documentId }, JOBS)).rejects.toThrow('react-pdf exploded');
    expect(uow.documents.rows.get(documentId)?.status).toBe('failed');
    expect(unwrapErr(await download.execute({ documentId }, READER))).toEqual({
      type: 'DocumentNotReady',
    });
  });

  it('renders the owner report of the period and emails it with the PDF attached', async () => {
    const { request, render, ownerReportRenderer, ownerReports, send, mailer, uow } = documents();
    const { documentId } = unwrap(
      await request.execute(
        { propertyId: PROPERTY_ID, kind: 'owner_report', from: '2026-09-01', to: '2026-09-30' },
        READER,
      ),
    );
    unwrap(await render.execute({ documentId }, JOBS));
    // El alta de la propiedad va al reporte, para comparar "desde el alta".
    expect(ownerReports.requested).toEqual([
      {
        from: '2026-09-01',
        to: '2026-09-30',
        listedAt: uow.properties.rows.get(PROPERTY_ID)?.createdAt,
      },
    ]);
    const content = ownerReportRenderer.rendered[0];
    expect(content?.report).toMatchObject({ emailSends: 2, inquiries: 4 });
    expect(content).toMatchObject({
      // Sin opciones, lleva todo.
      options: { publications: true, statistics: true },
      address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
      contact: BRANCH_CONTACT,
      producer: { name: 'Camila Ruiz' },
      webUrl: undefined,
    });

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

  it('prints the owner report with the chosen sections and without what Mi empresa hides', async () => {
    const { request, render, ownerReportRenderer } = documents(true, {
      showCompanyContact: false,
      agentInfo: 'hide',
    });
    const { documentId } = unwrap(
      await request.execute(
        {
          propertyId: PROPERTY_ID,
          kind: 'owner_report',
          from: '2026-09-01',
          to: '2026-09-30',
          options: { publications: false },
        },
        READER,
      ),
    );
    unwrap(await render.execute({ documentId }, JOBS));
    expect(ownerReportRenderer.rendered[0]).toMatchObject({
      options: { publications: false, statistics: true },
      contact: undefined,
      producer: undefined,
    });
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

describe('DownloadPropertyAppraisalSheet', () => {
  const OWNER_ID = '00000000-0000-7000-8000-00000000c001';
  const OWNER = {
    name: 'Ana Pérez',
    phone: '+541148001111',
    mobile: '+5491166660000',
    email: 'ana@example.com',
  };

  function sheet() {
    const ctx = setup();
    const row = ctx.uow.properties.rows.get(PROPERTY_ID);
    // Tiene cargado un adicional del catálogo (pileta) y otro que no entra en la página.
    if (row) ctx.uow.properties.rows.set(PROPERTY_ID, { ...row, featureIds: ['pool', 'late'] });
    ctx.lookups.owners_ = [{ id: OWNER_ID, name: 'Ana Pérez' }];
    const catalog = new StubPropertyCatalogQuery();
    catalog.featureRows = [
      {
        id: 'water',
        kind: 'service',
        key: 'water',
        name: 'Agua corriente',
        position: 0,
        isActive: true,
      },
      { id: 'pool', kind: 'amenity', key: 'pool', name: 'Pileta', position: 0, isActive: true },
      { id: 'grill', kind: 'amenity', key: 'grill', name: 'Parrilla', position: 1, isActive: true },
    ];
    const owners = new InMemoryOwnerContacts(new Map([[OWNER_ID, OWNER]]));
    const renderer = new FakeAppraisalSheetRenderer();
    const download = new DownloadPropertyAppraisalSheet({
      ...ctx,
      catalog,
      owners,
      storage: new InMemoryFileStorage(),
      settings: settingsReader(),
      renderer,
    });
    return { ...ctx, catalog, owners, renderer, download };
  }

  it('prints the sheet with the catalog as checkboxes, ticking what the property has', async () => {
    const { download, renderer, catalog, uow } = sheet();
    const file = unwrap(
      await download.execute(
        { propertyId: PROPERTY_ID },
        Actor.user(PRODUCER_ID, ['properties:read', 'properties:export', 'clients:read-owners']),
      ),
    );
    expect(file).toMatchObject({
      fileName: 'Planilla-tasacion-DEP0001.pdf',
      contentType: 'application/pdf',
    });
    const content = renderer.rendered[0];
    expect(content?.features).toEqual({
      service: [{ name: 'Agua corriente', checked: false }],
      room: [],
      amenity: [
        { name: 'Pileta', checked: true },
        { name: 'Parrilla', checked: false },
        // Cargado en la ficha pero fuera de la página del catálogo: igual sale, marcado.
        { name: 'Ítem late', checked: true },
      ],
    });
    expect(content).toMatchObject({
      owners: [OWNER],
      // La planilla es interna: la dirección completa.
      address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
    });
    // Solo las activas del catálogo, con un tope por grupo.
    expect(catalog.featureRequests.find((request) => request.kind === 'amenity')).toMatchObject({
      active: true,
      limit: APPRAISAL_SHEET_FEATURES_PER_KIND,
    });
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'property.exported',
      entityId: PROPERTY_ID,
      changes: { kind: { before: null, after: 'appraisal_sheet' } },
    });
  });

  it('leaves the owners out without permission to see them', async () => {
    const { download, renderer, owners } = sheet();
    unwrap(await download.execute({ propertyId: PROPERTY_ID }, READER));
    expect(renderer.rendered[0]?.owners).toEqual([]);
    expect(owners.requested).toEqual([]);
  });

  it('needs to read and export properties, and a property that exists', async () => {
    const { download } = sheet();
    expect(
      unwrapErr(
        await download.execute(
          { propertyId: PROPERTY_ID },
          Actor.user(PRODUCER_ID, ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await download.execute({ propertyId: '00000000-0000-7000-8000-0000000000ff' }, READER),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(unwrapErr(await download.execute({ propertyId: 'nope' }, READER)).type).toBe(
      'InvalidInput',
    );
  });
});
