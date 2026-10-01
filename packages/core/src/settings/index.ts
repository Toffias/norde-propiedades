// API pública del módulo settings (`@norde/core/settings`).

export * from './contracts';

export {
  COMPANY_SETTINGS_ID,
  CompanySettings,
  DEFAULT_TIMEZONE,
  NEWS_SCOPES,
  type CompanySettingsSnapshot,
  type EmailSender,
  type NewsScope,
} from './domain/company-settings';
export {
  COMPANY_SETTINGS_SECTIONS,
  type CompanySettingsChanged,
  type CompanySettingsSection,
} from './domain/company-settings.events';
export {
  DescriptionFooterTemplate,
  FOOTER_VARIABLES,
  type FooterVariable,
} from './domain/description-footer-template';
export {
  ADDRESS_DISPLAYS,
  DEFAULT_PDF_OPTIONS,
  type AddressDisplay,
  type PdfOptions,
} from './domain/pdf-options';
export {
  WATERMARK_POSITIONS,
  Watermark,
  type WatermarkPlacement,
  type WatermarkPosition,
  type WatermarkProps,
} from './domain/watermark';
export { WebUrlTemplate } from './domain/web-url-template';
export {
  REFERENCE_CODE_SCOPES,
  ReferenceCode,
  ReferenceCodePrefix,
  type InvalidReferenceCodeError,
  type ReferenceCodeContext,
  type ReferenceCodeScope,
  type ReferenceCodeScopeKey,
} from './domain/reference-code';
export {
  ReferenceCodeSequence,
  type ReferenceCodeSequenceId,
  type ReferenceCodeSequenceSnapshot,
} from './domain/reference-code-sequence';
export {
  FileFolder,
  FileName,
  type FileFolderId,
  type FileFolderSnapshot,
  type FolderContents,
} from './domain/file-folder';
export {
  ALLOWED_FILE_TYPES,
  CompanyFile,
  MAX_COMPANY_FILE_BYTES,
  type CompanyFileId,
  type CompanyFileSnapshot,
} from './domain/company-file';
export type {
  CompanyFileRepository,
  CompanySettingsRepository,
  FileFolderRepository,
  ReferenceCodeSequenceRepository,
} from './domain/settings.repository';

export type { ValidationFailedError } from './application/settings-input';
export type {
  SettingsTransaction,
  SettingsUnitOfWork,
} from './application/ports/settings-transaction';
export type { FileStorage, SignedUrlOptions, StoredObject } from './application/ports/file-storage';
export type { Mailer, MailerError, OutgoingEmail } from './application/ports/mailer';
export type { ImageWatermarker, InvalidImageError } from './application/ports/image-watermarker';
export type { ReferenceCodeUsage } from './application/ports/reference-code-usage';
export type { CompanySettingsReader } from './application/ports/company-settings-reader';
export type {
  ReferenceCodeSequenceQuery,
  ReferenceCodeSequenceRecord,
} from './application/ports/reference-code-sequence-query';
export type { Directory } from './application/ports/directory';
export type { CompanyFilesQuery } from './application/ports/company-files-query';

export {
  GetCompanySettings,
  type GetCompanySettingsError,
} from './application/queries/get-company-settings';
export { GetCompanyLogo, type GetCompanyLogoError } from './application/queries/get-company-logo';
export {
  PreviewWatermark,
  type PreviewWatermarkError,
} from './application/queries/preview-watermark';
export {
  UpdateGeneralSettings,
  type UpdateGeneralSettingsError,
} from './application/commands/update-general-settings';
export {
  ChangeCompanyLogo,
  type ChangeCompanyLogoError,
} from './application/commands/change-company-logo';
export {
  ConfigureWatermark,
  type ConfigureWatermarkError,
} from './application/commands/configure-watermark';
export {
  ChangeWatermarkLogo,
  type ChangeWatermarkLogoError,
} from './application/commands/change-watermark-logo';
export {
  UpdatePortalDescriptionFooter,
  type UpdatePortalDescriptionFooterError,
} from './application/commands/update-portal-description-footer';
export {
  UpdatePdfOptions,
  type UpdatePdfOptionsError,
} from './application/commands/update-pdf-options';
export {
  UpdateEmailSender,
  type UpdateEmailSenderError,
} from './application/commands/update-email-sender';
export { SendTestEmail, type SendTestEmailError } from './application/commands/send-test-email';

export {
  ListReferenceCodeSequences,
  type ListReferenceCodeSequencesError,
} from './application/queries/list-reference-code-sequences';
export { SearchDirectory, type SearchDirectoryError } from './application/queries/search-directory';
export {
  CreateReferenceCodeSequence,
  type CreateReferenceCodeSequenceError,
} from './application/commands/create-reference-code-sequence';
export {
  ChangeReferenceCodePrefix,
  type ChangeReferenceCodePrefixError,
} from './application/commands/change-reference-code-prefix';
export {
  DeleteReferenceCodeSequence,
  type DeleteReferenceCodeSequenceError,
} from './application/commands/delete-reference-code-sequence';
export {
  AllocateReferenceCode,
  type AllocateReferenceCodeError,
} from './application/commands/allocate-reference-code';

export {
  ListFolderContents,
  type FolderContentsView,
  type ListFolderContentsError,
} from './application/queries/list-folder-contents';
export {
  ListTrashedFiles,
  type ListTrashedFilesError,
} from './application/queries/list-trashed-files';
export {
  GetCompanyFileDownload,
  type GetCompanyFileDownloadError,
} from './application/queries/get-company-file-download';
export { CreateFolder, type CreateFolderError } from './application/commands/create-folder';
export { RenameFolder, type RenameFolderError } from './application/commands/rename-folder';
export { DeleteFolder, type DeleteFolderError } from './application/commands/delete-folder';
export {
  UploadCompanyFile,
  type UploadCompanyFileError,
} from './application/commands/upload-company-file';
export {
  RenameCompanyFile,
  type RenameCompanyFileError,
} from './application/commands/rename-company-file';
export {
  MoveCompanyFileToTrash,
  type MoveCompanyFileToTrashError,
} from './application/commands/move-company-file-to-trash';
export {
  RestoreCompanyFile,
  type RestoreCompanyFileError,
} from './application/commands/restore-company-file';
