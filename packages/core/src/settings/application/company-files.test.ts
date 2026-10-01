import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import {
  InMemoryCompanyFilesQuery,
  InMemoryFileStorage,
  InMemorySettingsUnitOfWork,
} from '../testing';

import { CreateFolder } from './commands/create-folder';
import { DeleteFolder } from './commands/delete-folder';
import { MoveCompanyFileToTrash } from './commands/move-company-file-to-trash';
import { RenameCompanyFile } from './commands/rename-company-file';
import { RenameFolder } from './commands/rename-folder';
import { RestoreCompanyFile } from './commands/restore-company-file';
import { UploadCompanyFile } from './commands/upload-company-file';
import { GetCompanyFileDownload } from './queries/get-company-file-download';
import { ListFolderContents } from './queries/list-folder-contents';
import { ListTrashedFiles } from './queries/list-trashed-files';

const admin = Actor.user('00000000-0000-7000-8000-0000000000ad', ['company-files:*']);
const agent = Actor.user('00000000-0000-7000-8000-0000000000a6', [
  'company-files:read',
  'company-files:upload',
]);
const MISSING = '00000000-0000-7000-8000-000000000999';
const PDF = {
  fileName: 'Contrato modelo.pdf',
  contentType: 'application/pdf',
  bytes: new Uint8Array([37, 80, 68, 70]),
};

function setup() {
  const uow = new InMemorySettingsUnitOfWork();
  const storage = new InMemoryFileStorage();
  const ids = new SequentialIdGenerator();
  const clock = new FixedClock('2026-05-01T12:00:00Z');
  const files = new InMemoryCompanyFilesQuery(uow);
  return {
    uow,
    storage,
    createFolder: new CreateFolder({ uow, ids }),
    renameFolder: new RenameFolder({ uow }),
    deleteFolder: new DeleteFolder({ uow }),
    upload: new UploadCompanyFile({ uow, storage, ids }),
    rename: new RenameCompanyFile({ uow }),
    trash: new MoveCompanyFileToTrash({ uow, clock }),
    restore: new RestoreCompanyFile({ uow }),
    download: new GetCompanyFileDownload({ files: uow.files, storage }),
    list: new ListFolderContents({ files }),
    listTrash: new ListTrashedFiles({ files }),
  };
}

describe('folders', () => {
  it('creates nested folders, lists them with the breadcrumb and audits', async () => {
    const ctx = setup();

    const { folderId: root } = unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));
    const { folderId: child } = unwrap(
      await ctx.createFolder.execute({ parentId: root, name: 'Modelos' }, admin),
    );

    const view = unwrap(await ctx.list.execute({ folderId: child }, admin));
    expect(view.breadcrumb).toEqual([
      { id: root, name: 'Contratos' },
      { id: child, name: 'Modelos' },
    ]);
    const rootView = unwrap(await ctx.list.execute({}, admin));
    expect(rootView.entries.items).toEqual([expect.objectContaining({ kind: 'folder', id: root })]);
    expect(ctx.uow.audit.entries[1]).toMatchObject({
      kind: 'created',
      action: 'file_folder.created',
      entityType: 'file_folder',
      entityId: child,
      changes: {
        name: { before: null, after: 'Modelos' },
        parentId: { before: null, after: root },
      },
    });
  });

  it('rejects repeated names in the same place and unknown parents', async () => {
    const ctx = setup();
    unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));

    expect(unwrapErr(await ctx.createFolder.execute({ name: 'Contratos' }, admin))).toEqual({
      type: 'FolderNameTaken',
    });
    expect(
      unwrapErr(await ctx.createFolder.execute({ parentId: MISSING, name: 'X' }, admin)),
    ).toEqual({ type: 'FolderNotFound' });
    expect(unwrapErr(await ctx.list.execute({ folderId: MISSING }, admin))).toEqual({
      type: 'FolderNotFound',
    });
  });

  it('renames a folder', async () => {
    const ctx = setup();
    const { folderId } = unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));
    unwrap(await ctx.createFolder.execute({ name: 'Manuales' }, admin));

    expect(
      unwrapErr(await ctx.renameFolder.execute({ folderId, name: 'Manuales' }, admin)),
    ).toEqual({ type: 'FolderNameTaken' });
    unwrap(await ctx.renameFolder.execute({ folderId, name: 'Contratos 2026' }, admin));

    expect(ctx.uow.audit.entries.at(-1)).toMatchObject({
      action: 'file_folder.renamed',
      changes: { name: { before: 'Contratos', after: 'Contratos 2026' } },
    });
  });

  it('moves the trashed files of a deleted folder to the root, auditing each one', async () => {
    const ctx = setup();
    const { folderId } = unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));
    const { fileId } = unwrap(await ctx.upload.execute({ ...PDF, folderId }, admin));
    unwrap(await ctx.trash.execute({ fileId }, admin));

    unwrap(await ctx.deleteFolder.execute({ folderId }, admin));

    expect(ctx.uow.folders.rows.has(folderId)).toBe(false);
    expect(ctx.uow.files.rows.get(fileId)?.folderId).toBeUndefined();
    expect(ctx.uow.audit.entries.slice(-2)).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'company_file.moved',
        entityId: fileId,
        changes: { folderId: { before: folderId, after: null } },
      }),
      expect.objectContaining({
        kind: 'action',
        action: 'file_folder.deleted',
        entityId: folderId,
      }),
    ]);
    unwrap(await ctx.restore.execute({ fileId }, admin));
    expect(unwrap(await ctx.list.execute({}, admin)).entries.items).toEqual([
      expect.objectContaining({ kind: 'file', id: fileId }),
    ]);
  });

  it('deletes a folder only without subfolders or active files', async () => {
    const ctx = setup();
    const { folderId: parent } = unwrap(await ctx.createFolder.execute({ name: 'Padre' }, admin));
    unwrap(await ctx.createFolder.execute({ parentId: parent, name: 'Hija' }, admin));
    expect(unwrapErr(await ctx.deleteFolder.execute({ folderId: parent }, admin))).toEqual({
      type: 'FolderNotEmpty',
    });
  });

  it('deletes a folder only when it is empty', async () => {
    const ctx = setup();
    const { folderId } = unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));
    unwrap(await ctx.upload.execute({ ...PDF, folderId }, admin));

    expect(unwrapErr(await ctx.deleteFolder.execute({ folderId }, admin))).toEqual({
      type: 'FolderNotEmpty',
    });

    const { folderId: empty } = unwrap(await ctx.createFolder.execute({ name: 'Vacía' }, admin));
    unwrap(await ctx.deleteFolder.execute({ folderId: empty }, admin));
    expect(ctx.uow.folders.rows.has(empty)).toBe(false);
    expect(ctx.uow.audit.entries.at(-1)).toMatchObject({
      kind: 'action',
      action: 'file_folder.deleted',
    });
  });

  it('requires managing files', async () => {
    const ctx = setup();
    const { folderId } = unwrap(await ctx.createFolder.execute({ name: 'Contratos' }, admin));
    expect(unwrapErr(await ctx.createFolder.execute({ name: 'X' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await ctx.renameFolder.execute({ folderId, name: 'X' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await ctx.deleteFolder.execute({ folderId }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('files', () => {
  it('uploads to the storage with a generated key, audits and downloads it', async () => {
    const ctx = setup();

    const { fileId } = unwrap(await ctx.upload.execute(PDF, agent));

    const row = ctx.uow.files.rows.get(fileId);
    expect(row).toMatchObject({
      storageKey: `company-files/${fileId}`,
      mimeType: 'application/pdf',
      sizeBytes: 4,
      uploadedBy: agent.id,
    });
    expect(ctx.storage.objects.has(`company-files/${fileId}`)).toBe(true);
    expect(ctx.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'company_file.uploaded',
        entityType: 'company_file',
        entityId: fileId,
        changes: {
          name: { before: null, after: 'Contrato modelo.pdf' },
          mimeType: { before: null, after: 'application/pdf' },
          sizeBytes: { before: null, after: 4 },
        },
      }),
    ]);
    expect(unwrap(await ctx.download.execute({ fileId }, agent))).toEqual({
      fileName: 'Contrato modelo.pdf',
      contentType: 'application/pdf',
      bytes: PDF.bytes,
    });
  });

  it('rejects disallowed types and unknown folders without leaving the upload behind', async () => {
    const ctx = setup();

    expect(
      unwrapErr(
        await ctx.upload.execute({ ...PDF, contentType: 'application/x-msdownload' }, admin),
      ),
    ).toEqual({ type: 'FileTypeNotAllowed' });
    expect(unwrapErr(await ctx.upload.execute({ ...PDF, folderId: MISSING }, admin))).toEqual({
      type: 'FolderNotFound',
    });
    expect(unwrapErr(await ctx.upload.execute({ ...PDF, fileName: 'a/b.pdf' }, admin))).toEqual({
      type: 'InvalidFileName',
    });
    expect(ctx.storage.objects.size).toBe(0);
    expect(ctx.uow.files.rows.size).toBe(0);
  });

  it('renames a file', async () => {
    const ctx = setup();
    const { fileId } = unwrap(await ctx.upload.execute(PDF, admin));

    unwrap(await ctx.rename.execute({ fileId, name: 'Contrato de alquiler.pdf' }, admin));

    expect(ctx.uow.audit.entries.at(-1)).toMatchObject({
      action: 'company_file.renamed',
      changes: { name: { before: 'Contrato modelo.pdf', after: 'Contrato de alquiler.pdf' } },
    });
    expect(unwrapErr(await ctx.rename.execute({ fileId: MISSING, name: 'x' }, admin))).toEqual({
      type: 'FileNotFound',
    });
  });

  it('moves to the trash, hides it, lists the trash and restores it', async () => {
    const ctx = setup();
    const { fileId } = unwrap(await ctx.upload.execute(PDF, admin));

    unwrap(await ctx.trash.execute({ fileId }, admin));

    expect(unwrap(await ctx.list.execute({}, admin)).entries.total).toBe(0);
    expect(unwrapErr(await ctx.download.execute({ fileId }, admin))).toEqual({
      type: 'FileNotFound',
    });
    expect(unwrap(await ctx.listTrash.execute({}, admin)).items).toEqual([
      expect.objectContaining({ id: fileId, deletedBy: admin.id }),
    ]);
    expect(unwrapErr(await ctx.trash.execute({ fileId }, admin))).toEqual({
      type: 'FileAlreadyInTrash',
    });

    unwrap(await ctx.restore.execute({ fileId }, admin));

    expect(unwrap(await ctx.list.execute({}, admin)).entries.total).toBe(1);
    expect(ctx.uow.audit.entries.map((e) => e.action)).toEqual([
      'company_file.uploaded',
      'company_file.deleted',
      'company_file.restored',
    ]);
    expect(unwrapErr(await ctx.restore.execute({ fileId }, admin))).toEqual({
      type: 'FileNotInTrash',
    });
  });

  it('lets agents upload and download, but not rename, delete or see the trash', async () => {
    const ctx = setup();
    const { fileId } = unwrap(await ctx.upload.execute(PDF, agent));
    const outsider = Actor.user(MISSING, []);

    expect(unwrapErr(await ctx.rename.execute({ fileId, name: 'x' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await ctx.trash.execute({ fileId }, agent))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await ctx.restore.execute({ fileId }, agent))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await ctx.listTrash.execute({}, agent))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await ctx.upload.execute(PDF, outsider))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await ctx.download.execute({ fileId }, outsider))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await ctx.list.execute({}, outsider))).toEqual({ type: 'Forbidden' });
  });
});
