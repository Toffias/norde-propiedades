import {
  AllocateReferenceCode,
  CompanyFile,
  FileFolder,
  FileName,
  ReferenceCodePrefix,
  ReferenceCodeSequence,
  WebUrlTemplate,
  Watermark,
} from '@norde/core/settings';
import { Actor, Email, parseId } from '@norde/core/shared';
import { FixedClock, unwrap } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { branches, companySettings, properties, teams, users } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import {
  DrizzleCompanyFilesQuery,
  DrizzleDirectory,
  DrizzleReferenceCodeSequenceQuery,
} from './drizzle-settings-queries';
import {
  DrizzleCompanyFileRepository,
  DrizzleCompanySettingsRepository,
  DrizzleFileFolderRepository,
  DrizzleReferenceCodeSequenceRepository,
} from './drizzle-settings-repositories';
import { createSettingsUnitOfWork } from './settings-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const ACTOR = '01920000-0000-7000-8000-0000000000ad';
const agent = Actor.user(ACTOR, ['properties:create']);

function name(raw: string) {
  return unwrap(FileName.create(raw));
}

async function createSequence(
  scope: 'global' | 'user' | 'property_type',
  scopeValue: string,
  prefix: string,
) {
  const sequence = unwrap(
    ReferenceCodeSequence.create({
      id: unwrap(parseId<'ReferenceCodeSequence'>(ids.next())),
      key: { scope, scopeValue },
      prefix: unwrap(ReferenceCodePrefix.create(prefix)),
      conflicts: [],
    }),
  );
  await new DrizzleReferenceCodeSequenceRepository(db, clock).save(sequence, ACTOR);
  return sequence;
}

async function createFolder(folderName: string, parent?: FileFolder) {
  const folder = unwrap(
    FileFolder.create({
      id: unwrap(parseId<'FileFolder'>(ids.next())),
      parent,
      name: name(folderName),
      nameTaken: false,
    }),
  );
  await new DrizzleFileFolderRepository(db, clock).save(folder, ACTOR);
  return folder;
}

async function createFile(fileName: string, folder: FileFolder | undefined, sizeBytes = 10) {
  const id = unwrap(parseId<'CompanyFile'>(ids.next()));
  const file = unwrap(
    CompanyFile.upload({
      id,
      folderId: folder?.id,
      name: name(fileName),
      storageKey: `company-files/${id}`,
      mimeType: 'application/pdf',
      sizeBytes,
      uploadedBy: ACTOR,
    }),
  );
  await new DrizzleCompanyFileRepository(db, clock).save(file, ACTOR);
  return file;
}

describe('DrizzleCompanySettingsRepository', () => {
  it('reads the migration defaults', async () => {
    const settings = await new DrizzleCompanySettingsRepository(db, clock).get();
    expect(settings.toSnapshot()).toMatchObject({
      name: 'Norde Propiedades',
      timezone: 'America/Argentina/Buenos_Aires',
      newsScope: 'all',
      logoKey: undefined,
    });
    expect(settings.watermark.enabled).toBe(false);
  });

  it('round-trips every section with the author', async () => {
    const repository = new DrizzleCompanySettingsRepository(db, clock);
    const settings = await repository.get();
    unwrap(
      settings.updateGeneral(
        {
          name: 'Norde',
          timezone: 'America/Argentina/Cordoba',
          webPropertyUrlTemplate: unwrap(WebUrlTemplate.create('https://norde.com.ar/p/{slug}')),
          webDevelopmentUrlTemplate: undefined,
          newsScope: 'branch',
        },
        clock.now(),
      ),
    );
    settings.changeLogo('settings/logo/1', clock.now());
    settings.configureWatermark(
      unwrap(
        Watermark.create({
          enabled: true,
          logoKey: 'settings/watermark/1',
          sizePercent: 30,
          position: 'top-left',
          opacity: 40,
        }),
      ),
      clock.now(),
    );
    settings.updatePdfOptions(
      {
        showCompanyContact: false,
        showAgent: true,
        showPrice: false,
        addressOnSend: 'hidden',
        addressOnDownload: 'approximate',
        developmentPhotosInUnits: false,
      },
      clock.now(),
    );
    unwrap(
      settings.updateEmailSender(
        { fromName: 'Norde', replyTo: unwrap(Email.create('hola@norde.com.ar')) },
        clock.now(),
      ),
    );

    await repository.save(settings, ACTOR);

    const read = (await repository.get()).toSnapshot();
    expect(read).toMatchObject({
      name: 'Norde',
      logoKey: 'settings/logo/1',
      timezone: 'America/Argentina/Cordoba',
      newsScope: 'branch',
      pdfOptions: { showCompanyContact: false, addressOnSend: 'hidden' },
      emailSender: { fromName: 'Norde' },
    });
    expect(read.webPropertyUrlTemplate?.value).toBe('https://norde.com.ar/p/{slug}');
    expect(read.watermark.toProps()).toEqual({
      enabled: true,
      logoKey: 'settings/watermark/1',
      sizePercent: 30,
      position: 'top-left',
      opacity: 40,
    });
    expect(read.emailSender.replyTo?.value).toBe('hola@norde.com.ar');
    const [row] = await db.select().from(companySettings);
    expect(row?.updatedBy).toBe(ACTOR);
  });
});

describe('reference code sequences', () => {
  it('rejects two sequences with the same prefix at the database level', async () => {
    await createSequence('global', '', 'P');
    await expect(createSequence('user', ACTOR, 'P')).rejects.toThrow();
  });

  it('keeps the counter when the prefix changes', async () => {
    const repository = new DrizzleReferenceCodeSequenceRepository(db, clock);
    const sequence = await createSequence('global', '', 'P');
    await repository.takeNextNumber(sequence.id);

    unwrap(sequence.changePrefix(unwrap(ReferenceCodePrefix.create('N')), []));
    await repository.save(sequence, ACTOR);

    const read = await repository.findById(sequence.id);
    expect(read?.toSnapshot()).toMatchObject({ nextNumber: 2n });
    expect(read?.prefix.value).toBe('N');
  });

  it('finds sequences by scope and by prefix', async () => {
    const repository = new DrizzleReferenceCodeSequenceRepository(db, clock);
    await createSequence('global', '', 'P');
    await createSequence('property_type', 'house', 'CAS');

    const found = await repository.findByScopes([
      { scope: 'property_type', scopeValue: 'house' },
      { scope: 'user', scopeValue: ACTOR },
      { scope: 'global', scopeValue: '' },
    ]);
    expect(found.map((s) => s.prefix.value).sort()).toEqual(['CAS', 'P']);
    expect((await repository.findByPrefix(unwrap(ReferenceCodePrefix.create('cas'))))?.scope).toBe(
      'property_type',
    );
  });

  it('never hands out the same code to concurrent allocations', async () => {
    await createSequence('global', '', 'P');
    const allocate = new AllocateReferenceCode({
      uow: createSettingsUnitOfWork(db, { ids, clock }),
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => allocate.execute({ target: 'property' }, agent)),
    );

    const codes = results.map((r) => unwrap(r).code);
    expect(new Set(codes).size).toBe(20);
    expect(codes.sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('skips a code already used by a property', async () => {
    await createSequence('global', '', 'P');
    const now = clock.now();
    await db.insert(properties).values({
      id: ids.next(),
      code: 'P0001',
      slug: 'casa-p0001',
      title: 'Casa',
      operation: 'sale',
      propertyType: 'house',
      status: 'available',
      neighborhood: 'Centro',
      city: 'Salta',
      province: 'Salta',
      currency: 'USD',
      priceCents: 1n,
      createdAt: now,
      updatedAt: now,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    const allocate = new AllocateReferenceCode({
      uow: createSettingsUnitOfWork(db, { ids, clock }),
    });

    expect(unwrap(await allocate.execute({ target: 'property' }, agent)).code).toBe('P0002');
  });

  it('pages the list without overlaps, sorted by prefix', async () => {
    for (const [i, prefix] of ['A', 'B', 'C', 'D', 'E'].entries()) {
      await createSequence(i === 0 ? 'global' : 'user', i === 0 ? '' : ids.next(), prefix);
    }
    const query = new DrizzleReferenceCodeSequenceQuery(db);
    const sort = { field: 'prefix', direction: 'desc' } as const;

    const first = await query.list({ offset: 0, limit: 3, sort });
    const second = await query.list({ offset: 3, limit: 3, sort });

    expect(first.total).toBe(5);
    expect([...first.items, ...second.items].map((r) => r.prefix)).toEqual([
      'E',
      'D',
      'C',
      'B',
      'A',
    ]);
    const bySort = await query.list({
      offset: 0,
      limit: 5,
      sort: { field: 'scope', direction: 'asc' },
    });
    expect(bySort.items[0]?.scope).toBe('global');
  });
});

describe('DrizzleDirectory', () => {
  it('searches users, teams and branches by name, without accents', async () => {
    const now = clock.now();
    const audit = { createdAt: now, updatedAt: now, createdBy: ACTOR, updatedBy: ACTOR };
    const branchId = ids.next();
    await db.insert(branches).values({ id: branchId, name: 'Casa central', ...audit });
    await db.insert(teams).values({ id: ids.next(), name: 'Ventas', branchId, ...audit });
    const ana = ids.next();
    await db.insert(users).values([
      { id: ana, email: 'ana@norde.com.ar', name: 'Ana Gómez', ...audit },
      { id: ids.next(), email: 'beto@norde.com.ar', name: 'Beto Ruiz', ...audit },
      {
        id: ids.next(),
        email: 'old@norde.com.ar',
        name: 'Gomez suspendido',
        status: 'suspended',
        ...audit,
      },
    ]);
    const directory = new DrizzleDirectory(db);
    const params = { offset: 0, limit: 10, direction: 'asc' } as const;

    const found = await directory.search({ ...params, kind: 'user', search: 'gomez' });
    expect(found).toEqual({ items: [{ id: ana, name: 'Ana Gómez' }], total: 1 });
    expect((await directory.search({ ...params, kind: 'user', search: undefined })).total).toBe(2);
    expect((await directory.search({ ...params, kind: 'team', search: 'vent' })).total).toBe(1);
    expect((await directory.search({ ...params, kind: 'branch', search: '%' })).total).toBe(0);
    expect(await directory.names('user', [ana, 'no-es-un-id'])).toEqual(
      new Map([[ana, 'Ana Gómez']]),
    );
  });
});

describe('company files', () => {
  it('lists folders before files, paged without overlaps and in each sort', async () => {
    const root = await createFolder('Contratos');
    await createFolder('Zeta', root);
    await createFolder('Alfa', root);
    await createFile('b.pdf', root, 300);
    await createFile('a.pdf', root, 100);
    clock.advance(1000);
    await createFile('c.pdf', root, 200);
    const trashed = await createFile('borrado.pdf', root);
    unwrap(trashed.moveToTrash(ACTOR, clock.now()));
    await new DrizzleCompanyFileRepository(db, clock).save(trashed, ACTOR);
    const query = new DrizzleCompanyFilesQuery(db);
    const list = (
      offset: number,
      field: 'name' | 'size' | 'updatedAt',
      direction: 'asc' | 'desc',
    ) => query.listFolder({ folderId: root.id, offset, limit: 3, sort: { field, direction } });

    const [first, second] = await Promise.all([list(0, 'name', 'asc'), list(3, 'name', 'asc')]);
    expect(first.total).toBe(5);
    expect([...first.items, ...second.items].map((e) => e.name)).toEqual([
      'Alfa',
      'Zeta',
      'a.pdf',
      'b.pdf',
      'c.pdf',
    ]);
    const bySize = await query.listFolder({
      folderId: root.id,
      offset: 0,
      limit: 10,
      sort: { field: 'size', direction: 'desc' },
    });
    expect(bySize.items.map((e) => e.name)).toEqual(['Alfa', 'Zeta', 'b.pdf', 'c.pdf', 'a.pdf']);
    const byDate = await list(0, 'updatedAt', 'desc');
    expect(byDate.items.map((e) => e.kind)).toEqual(['folder', 'folder', 'file']);
    expect(
      (
        await query.listFolder({
          folderId: undefined,
          offset: 0,
          limit: 10,
          sort: { field: 'name', direction: 'asc' },
        })
      ).items,
    ).toEqual([expect.objectContaining({ kind: 'folder', id: root.id })]);
  });

  it('builds the breadcrumb and counts the contents, including the trash', async () => {
    const root = await createFolder('Contratos');
    const child = await createFolder('Modelos', root);
    const file = await createFile('modelo.pdf', child);
    unwrap(file.moveToTrash(ACTOR, clock.now()));
    await new DrizzleCompanyFileRepository(db, clock).save(file, ACTOR);
    const folders = new DrizzleFileFolderRepository(db, clock);

    expect(await new DrizzleCompanyFilesQuery(db).breadcrumb(child.id)).toEqual([
      { id: root.id, name: 'Contratos' },
      { id: child.id, name: 'Modelos' },
    ]);
    expect(await folders.contents(root.id)).toEqual({ folders: 1, files: 0 });
    expect(await folders.contents(child.id)).toEqual({ folders: 0, files: 1 });
    expect(await folders.nameExists(root.id, name('Modelos'))).toBe(true);
    expect(await folders.nameExists(root.id, name('Modelos'), child.id)).toBe(false);
    expect(await folders.nameExists(undefined, name('Contratos'))).toBe(true);
  });

  it('lists the trash and round-trips the file', async () => {
    const file = await createFile('viejo.pdf', undefined);
    unwrap(file.moveToTrash(ACTOR, clock.now()));
    const repository = new DrizzleCompanyFileRepository(db, clock);
    await repository.save(file, ACTOR);
    await createFile('vigente.pdf', undefined);

    const trash = await new DrizzleCompanyFilesQuery(db).listTrash({
      offset: 0,
      limit: 10,
      sort: { field: 'deletedAt', direction: 'desc' },
    });
    expect(trash).toEqual({
      items: [expect.objectContaining({ id: file.id, name: 'viejo.pdf', deletedBy: ACTOR })],
      total: 1,
    });
    expect((await repository.findById(file.id))?.isInTrash).toBe(true);
  });
});
