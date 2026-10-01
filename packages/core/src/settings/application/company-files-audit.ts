import type { AuditState, AuditTarget } from '../../shared';
import type { CompanyFile } from '../domain/company-file';
import type { FileFolder } from '../domain/file-folder';

export function folderAuditState(folder: FileFolder): AuditState {
  return { name: folder.name.value, parentId: folder.parentId };
}

export function folderTarget(folder: FileFolder, action: string): AuditTarget {
  return { action, entityType: 'file_folder', entityId: folder.id, clientIds: [] };
}

/** Lo que se audita de un archivo. La clave del storage no: es interna. */
export function fileAuditState(file: CompanyFile): AuditState {
  return {
    name: file.name.value,
    folderId: file.folderId,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

export function fileTarget(file: CompanyFile, action: string): AuditTarget {
  return { action, entityType: 'company_file', entityId: file.id, clientIds: [] };
}
