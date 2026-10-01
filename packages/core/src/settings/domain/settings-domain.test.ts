import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { unwrap, unwrapErr } from '../../shared/testing';

import { CompanyFile, MAX_COMPANY_FILE_BYTES, type CompanyFileId } from './company-file';
import { CompanySettings } from './company-settings';
import { DescriptionFooterTemplate } from './description-footer-template';
import { FileFolder, FileName, MAX_FOLDER_DEPTH, type FileFolderId } from './file-folder';
import {
  ReferenceCode,
  ReferenceCodePrefix,
  referenceCodeCandidates,
  resolveReferenceCodeScope,
  type ReferenceCodeScopeKey,
} from './reference-code';
import { ReferenceCodeSequence } from './reference-code-sequence';
import { Watermark, type WatermarkProps } from './watermark';
import { WebUrlTemplate } from './web-url-template';

const NOW = new Date('2026-05-01T12:00:00Z');

function id<T extends string>(n: number) {
  return unwrap(parseId<T>(`00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`));
}

function prefix(raw: string): ReferenceCodePrefix {
  return unwrap(ReferenceCodePrefix.create(raw));
}

function name(raw: string): FileName {
  return unwrap(FileName.create(raw));
}

describe('WebUrlTemplate', () => {
  it('accepts an https url with one placeholder and renders it', () => {
    const template = WebUrlTemplate.create(' https://norde.com.ar/propiedades/{slug} ');
    expect(template.isOk()).toBe(true);
    expect(unwrap(template).render({ id: '1', slug: 'casa en lomas' })).toBe(
      'https://norde.com.ar/propiedades/casa%20en%20lomas',
    );
  });

  it.each([
    'https://norde.com.ar/propiedades',
    'https://norde.com.ar/{id}/{slug}',
    'http://norde.com.ar/{id}',
    'norde.com.ar/{id}',
    'https://{id}',
  ])('rejects %s', (raw) => {
    expect(WebUrlTemplate.create(raw).isErr()).toBe(true);
  });
});

describe('Watermark', () => {
  const props: WatermarkProps = {
    enabled: true,
    logoKey: 'settings/watermark/logo',
    sizePercent: 20,
    position: 'bottom-right',
    opacity: 60,
  };

  it('requires a logo when enabled', () => {
    expect(unwrapErr(Watermark.create({ ...props, logoKey: undefined }))).toEqual({
      type: 'WatermarkLogoRequired',
    });
    expect(Watermark.create({ ...props, enabled: false, logoKey: undefined }).isOk()).toBe(true);
  });

  it('validates size and opacity ranges', () => {
    expect(unwrapErr(Watermark.create({ ...props, sizePercent: 4 }))).toMatchObject({
      reason: 'size',
    });
    expect(unwrapErr(Watermark.create({ ...props, sizePercent: 51 }))).toMatchObject({
      reason: 'size',
    });
    expect(unwrapErr(Watermark.create({ ...props, opacity: 101 }))).toMatchObject({
      reason: 'opacity',
    });
    expect(Watermark.create({ ...props, opacity: 0 }).isOk()).toBe(true);
  });

  it('places the logo scaled to the configured width, with margin', () => {
    const watermark = unwrap(Watermark.create(props));
    // Foto 1000x500: margen 15 px (3% de 500); logo a 200 px de ancho (20%).
    expect(watermark.placement({ width: 1000, height: 500 }, { width: 400, height: 100 })).toEqual({
      left: 785,
      top: 435,
      width: 200,
      height: 50,
    });
  });

  it.each([
    ['top-left', { left: 15, top: 15 }],
    ['center', { left: 400, top: 225 }],
    ['bottom-center', { left: 400, top: 435 }],
    ['middle-right', { left: 785, top: 225 }],
  ] as const)('places the logo at %s', (position, expected) => {
    const watermark = unwrap(Watermark.create({ ...props, position }));
    expect(
      watermark.placement({ width: 1000, height: 500 }, { width: 400, height: 100 }),
    ).toMatchObject(expected);
  });

  it('never makes the logo taller than the photo', () => {
    const watermark = unwrap(Watermark.create({ ...props, sizePercent: 50 }));
    const placement = watermark.placement(
      { width: 1000, height: 100 },
      { width: 100, height: 400 },
    );
    expect(placement.height).toBeLessThanOrEqual(100);
  });
});

describe('DescriptionFooterTemplate', () => {
  it('renders the known variables and leaves missing ones empty', () => {
    const footer = unwrap(
      DescriptionFooterTemplate.create(
        'Código {codigo}. Consultas al {telefono_sucursal} {email_sucursal}',
      ),
    );
    expect(footer.render({ codigo: 'CAS0012', telefono_sucursal: '+54 11 4000-0000' })).toBe(
      'Código CAS0012. Consultas al +54 11 4000-0000',
    );
  });

  it('rejects unknown variables and long footers', () => {
    expect(unwrapErr(DescriptionFooterTemplate.create('Precio {precio}'))).toEqual({
      type: 'UnknownTemplateVariable',
      variable: 'precio',
    });
    expect(unwrapErr(DescriptionFooterTemplate.create('x'.repeat(1001)))).toEqual({
      type: 'FooterTooLong',
    });
  });
});

describe('CompanySettings', () => {
  it('updates the general section and emits the change', () => {
    const settings = CompanySettings.defaults();
    const result = settings.updateGeneral(
      {
        name: '  Norde  ',
        timezone: 'America/Argentina/Cordoba',
        webPropertyUrlTemplate: undefined,
        webDevelopmentUrlTemplate: undefined,
        newsScope: 'branch',
      },
      NOW,
    );
    expect(result.isOk()).toBe(true);
    expect(settings.toSnapshot()).toMatchObject({ name: 'Norde', newsScope: 'branch' });
    expect(settings.pullEvents()).toEqual([
      {
        type: 'settings.company_settings_changed',
        aggregateId: 'company',
        occurredAt: NOW,
        payload: { section: 'general' },
      },
    ]);
  });

  it('rejects an empty company name', () => {
    const settings = CompanySettings.defaults();
    const result = settings.updateGeneral(
      {
        name: ' ',
        timezone: 'UTC',
        webPropertyUrlTemplate: undefined,
        webDevelopmentUrlTemplate: undefined,
        newsScope: 'all',
      },
      NOW,
    );
    expect(unwrapErr(result)).toEqual({ type: 'InvalidCompanyName' });
  });

  it('returns the previous logo when it changes', () => {
    const settings = CompanySettings.defaults();
    expect(settings.changeLogo('settings/logo/a', NOW)).toBeUndefined();
    expect(settings.changeLogo('settings/logo/b', NOW)).toBe('settings/logo/a');
  });

  it('stores a blank sender name as empty', () => {
    const settings = CompanySettings.defaults();
    settings.updateEmailSender({ fromName: '  ', replyTo: undefined }, NOW);
    expect(settings.toSnapshot().emailSender.fromName).toBeUndefined();
    expect(
      settings.updateEmailSender({ fromName: 'x'.repeat(121), replyTo: undefined }, NOW).isErr(),
    ).toBe(true);
  });
});

describe('reference codes', () => {
  it('normalizes prefixes and rejects invalid ones', () => {
    expect(prefix(' cas ').value).toBe('CAS');
    expect(ReferenceCodePrefix.create('CASA123').isErr()).toBe(true);
    expect(ReferenceCodePrefix.create('C-1').isErr()).toBe(true);
    expect(ReferenceCodePrefix.create('').isErr()).toBe(true);
  });

  it('formats the code with 4 digits', () => {
    expect(ReferenceCode.format(prefix('CAS'), 12n).value).toBe('CAS0012');
    expect(ReferenceCode.format(prefix('P'), 12345n).value).toBe('P12345');
  });

  it('validates manual codes', () => {
    expect(unwrap(ReferenceCode.create(' cas-12 ')).value).toBe('CAS-12');
    expect(ReferenceCode.create('-12').isErr()).toBe(true);
    expect(ReferenceCode.create('A'.repeat(21)).isErr()).toBe(true);
  });

  it('orders the candidates from the most specific to global', () => {
    expect(
      referenceCodeCandidates({
        userId: 'u1',
        teamIds: ['t1', 't2'],
        branchId: 'b1',
        propertyType: 'house',
      }),
    ).toEqual([
      { scope: 'user', scopeValue: 'u1' },
      { scope: 'team', scopeValue: 't1' },
      { scope: 'team', scopeValue: 't2' },
      { scope: 'branch', scopeValue: 'b1' },
      { scope: 'property_type', scopeValue: 'house' },
      { scope: 'global', scopeValue: '' },
    ]);
  });

  it('resolves the most specific configured sequence', () => {
    const configured = [
      { scope: 'global', scopeValue: '', name: 'global' },
      { scope: 'property_type', scopeValue: 'house', name: 'type' },
      { scope: 'branch', scopeValue: 'b1', name: 'branch' },
      { scope: 'team', scopeValue: 't2', name: 'team' },
    ] as const;
    const context = { userId: 'u1', teamIds: ['t1', 't2'], branchId: 'b1', propertyType: 'house' };
    expect(resolveReferenceCodeScope(context, configured)?.name).toBe('team');
    expect(resolveReferenceCodeScope({ propertyType: 'house' }, configured)?.name).toBe('type');
    expect(resolveReferenceCodeScope({ propertyType: 'land' }, configured)?.name).toBe('global');
    expect(resolveReferenceCodeScope<ReferenceCodeScopeKey>({}, [])).toBeUndefined();
  });
});

describe('ReferenceCodeSequence', () => {
  function sequence(n: number, scope: 'global' | 'user', scopeValue: string, raw: string) {
    return unwrap(
      ReferenceCodeSequence.create({
        id: id<'ReferenceCodeSequence'>(n),
        key: { scope, scopeValue },
        prefix: prefix(raw),
        conflicts: [],
      }),
    );
  }

  it('starts at number 1', () => {
    expect(sequence(1, 'user', 'u1', 'EZ').toSnapshot()).toMatchObject({
      scope: 'user',
      scopeValue: 'u1',
      nextNumber: 1n,
    });
  });

  it('validates the scope value', () => {
    const create = (scope: 'global' | 'user', scopeValue: string) =>
      ReferenceCodeSequence.create({
        id: id<'ReferenceCodeSequence'>(1),
        key: { scope, scopeValue },
        prefix: prefix('P'),
        conflicts: [],
      });
    expect(unwrapErr(create('global', 'x'))).toEqual({ type: 'InvalidScopeValue' });
    expect(unwrapErr(create('user', ' '))).toEqual({ type: 'InvalidScopeValue' });
  });

  it('rejects a prefix or a scope already configured', () => {
    const existing = sequence(1, 'global', '', 'P');
    const create = (scopeValue: string, raw: string) =>
      ReferenceCodeSequence.create({
        id: id<'ReferenceCodeSequence'>(2),
        key: { scope: scopeValue === '' ? 'global' : 'user', scopeValue },
        prefix: prefix(raw),
        conflicts: [existing],
      });
    expect(unwrapErr(create('u1', 'p'))).toEqual({ type: 'PrefixInUse', prefix: 'P' });
    expect(unwrapErr(create('', 'X'))).toEqual({ type: 'ScopeAlreadyConfigured' });
  });

  it('changes the prefix unless another sequence uses it', () => {
    const own = sequence(1, 'user', 'u1', 'EZ');
    const other = sequence(2, 'user', 'u2', 'CM');
    expect(unwrapErr(own.changePrefix(prefix('CM'), [other]))).toEqual({
      type: 'PrefixInUse',
      prefix: 'CM',
    });
    expect(own.changePrefix(prefix('EZ'), [own]).isOk()).toBe(true);
    expect(own.changePrefix(prefix('ES'), []).isOk()).toBe(true);
    expect(own.prefix.value).toBe('ES');
  });

  it('never removes the global sequence', () => {
    expect(unwrapErr(sequence(1, 'global', '', 'P').ensureRemovable())).toEqual({
      type: 'GlobalSequenceRequired',
    });
    expect(sequence(2, 'user', 'u1', 'EZ').ensureRemovable().isOk()).toBe(true);
  });
});

describe('FileName', () => {
  it.each(['', ' ', '.', '..', 'a/b', 'a\\b', 'a\u0000b', 'x'.repeat(121)])('rejects %j', (raw) => {
    expect(FileName.create(raw).isErr()).toBe(true);
  });

  it('trims the name', () => {
    expect(name('  Contratos  ').value).toBe('Contratos');
  });
});

describe('FileFolder', () => {
  function folder(n: number, parent?: FileFolder) {
    return unwrap(
      FileFolder.create({
        id: id<'FileFolder'>(n),
        parent,
        name: name(`Carpeta ${n}`),
        nameTaken: false,
      }),
    );
  }

  it('builds the materialized path from the ancestors', () => {
    const root = folder(1);
    const child = folder(2, root);
    expect(root.path).toBe(`/${root.id}/`);
    expect(child.path).toBe(`/${root.id}/${child.id}/`);
    expect(child.parentId).toBe(root.id);
    expect(child.depth).toBe(2);
  });

  it('rejects a duplicated name and too deep trees', () => {
    expect(
      unwrapErr(
        FileFolder.create({
          id: id<'FileFolder'>(1),
          parent: undefined,
          name: name('A'),
          nameTaken: true,
        }),
      ),
    ).toEqual({ type: 'FolderNameTaken' });

    let parent = folder(1);
    for (let n = 2; n <= MAX_FOLDER_DEPTH; n += 1) parent = folder(n, parent);
    expect(
      unwrapErr(
        FileFolder.create({
          id: id<'FileFolder'>(99),
          parent,
          name: name('Profunda'),
          nameTaken: false,
        }),
      ),
    ).toEqual({ type: 'MaxFolderDepth' });
  });

  it('renames keeping the path', () => {
    const root = folder(1);
    expect(unwrapErr(root.rename(name('Otra'), true))).toEqual({ type: 'FolderNameTaken' });
    expect(root.rename(name('Otra'), false).isOk()).toBe(true);
    expect(root.name.value).toBe('Otra');
    expect(root.path).toBe(`/${root.id}/`);
  });

  it('is removable only when empty', () => {
    const root = folder(1);
    expect(unwrapErr(root.ensureRemovable({ folders: 0, files: 1 }))).toEqual({
      type: 'FolderNotEmpty',
    });
    expect(root.ensureRemovable({ folders: 1, files: 0 }).isErr()).toBe(true);
    expect(root.ensureRemovable({ folders: 0, files: 0 }).isOk()).toBe(true);
  });
});

describe('CompanyFile', () => {
  const upload = {
    id: id<'CompanyFile'>(1) satisfies CompanyFileId,
    folderId: undefined satisfies FileFolderId | undefined,
    name: name('Contrato modelo.pdf'),
    storageKey: 'company-files/1',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    uploadedBy: 'user-1',
  };

  it('validates size and type', () => {
    expect(unwrapErr(CompanyFile.upload({ ...upload, sizeBytes: 0 }))).toEqual({
      type: 'EmptyFile',
    });
    expect(
      unwrapErr(CompanyFile.upload({ ...upload, sizeBytes: MAX_COMPANY_FILE_BYTES + 1 })),
    ).toMatchObject({ type: 'FileTooLarge' });
    expect(
      unwrapErr(CompanyFile.upload({ ...upload, mimeType: 'application/x-msdownload' })),
    ).toEqual({ type: 'FileTypeNotAllowed' });
  });

  it('moves to the trash and restores', () => {
    const file = unwrap(CompanyFile.upload(upload));
    expect(file.moveToTrash('user-2', NOW).isOk()).toBe(true);
    expect(file.toSnapshot()).toMatchObject({ deletedAt: NOW, deletedBy: 'user-2' });
    expect(unwrapErr(file.moveToTrash('user-2', NOW))).toEqual({ type: 'FileAlreadyInTrash' });
    expect(file.restoreFromTrash().isOk()).toBe(true);
    expect(file.isInTrash).toBe(false);
    expect(unwrapErr(file.restoreFromTrash())).toEqual({ type: 'FileNotInTrash' });
  });
});
