// API pública del módulo appraisals (`@norde/core/appraisals`).

export * from './contracts';
export {
  APPRAISAL_STATUSES,
  APPRAISAL_STATUS_GROUPS,
  canAppraisalTransition,
  statusesOfGroup,
  type AppraisalStatus,
  type AppraisalStatusGroup,
  type ManualAppraisalStatus,
} from './domain/appraisal-status';
export {
  APPRAISAL_CONDITIONS,
  APPRAISAL_PROPERTY_TYPES,
  APPRAISAL_SOURCES,
  type AppraisalCondition,
  type AppraisalPropertyType,
  type AppraisalSource,
} from './domain/appraisal-values';
export {
  Appraisal,
  appraisalCode,
  APPRAISAL_CODE_PREFIX,
  type AppraisalId,
  type AppraisalSnapshot,
} from './domain/appraisal';
export {
  APPRAISAL_CURRENCIES,
  comparablePricePerM2Cents,
  EMPTY_APPRAISAL_RESULT,
  type AppraisalComparable,
  type AppraisalCurrency,
  type AppraisalResult,
  type AppraisalValueRange,
} from './domain/appraisal-result';
export {
  APPRAISAL_PHOTO_TYPES,
  appraisalPhotoKey,
  type AppraisalPhoto,
  type AppraisalPhotoId,
} from './domain/appraisal-photo';
export type {
  AppraisalConverted,
  AppraisalEvent,
  ConvertedListing,
  ConvertedListingPrice,
} from './domain/appraisal.events';
export type {
  AppraisalPhotoRepository,
  AppraisalRepository,
  ErasedAppraisals,
} from './domain/appraisal.repository';

export type {
  AppraisalCodeSequence,
  AppraisalsTransaction,
  AppraisalsUnitOfWork,
} from './application/ports/appraisals-transaction';
export type {
  AppraisalDetailItem,
  AppraisalFilterCriteria,
  AppraisalQuery,
  AppraisalSearchItem,
} from './application/ports/appraisal-query';
export type { ActiveUsers, PanelDirectory } from './application/ports/panel-directory';

export {
  CreateAppraisal,
  type CreateAppraisalError,
} from './application/commands/create-appraisal';
export {
  UpdateAppraisal,
  type UpdateAppraisalError,
} from './application/commands/update-appraisal';
export {
  ChangeAppraisalStatus,
  type ChangeAppraisalStatusError,
} from './application/commands/change-appraisal-status';
export {
  DeleteAppraisal,
  type DeleteAppraisalError,
} from './application/commands/delete-appraisal';
export {
  RestoreAppraisal,
  type RestoreAppraisalError,
} from './application/commands/restore-appraisal';
export {
  RecordAppraisalResult,
  type RecordAppraisalResultError,
} from './application/commands/record-appraisal-result';
export {
  UploadAppraisalPhoto,
  type UploadAppraisalPhotoError,
} from './application/commands/upload-appraisal-photo';
export {
  DeleteAppraisalPhoto,
  type DeleteAppraisalPhotoError,
} from './application/commands/delete-appraisal-photo';
export {
  ConvertAppraisalToListing,
  type ConvertAppraisalToListingError,
} from './application/commands/convert-appraisal-to-listing';
export {
  DownloadAppraisalReport,
  type AppraisalReportFile,
  type DownloadAppraisalReportError,
} from './application/commands/download-appraisal-report';
export type {
  AppraisalReportContent,
  AppraisalReportRenderer,
} from './application/ports/appraisal-report-renderer';
export {
  appraisalReportFileName,
  checkAppraisalReportable,
  type AppraisalNotReportableError,
} from './domain/appraisal-report';
export {
  GetAppraisalPhotoFile,
  type GetAppraisalPhotoFileError,
} from './application/queries/get-appraisal-photo-file';
export { ListAppraisals, type ListAppraisalsError } from './application/queries/list-appraisals';
export { GetAppraisal, type GetAppraisalError } from './application/queries/get-appraisal';
export {
  ListAppraisalHistory,
  type ListAppraisalHistoryError,
} from './application/queries/list-appraisal-history';
export {
  EraseClientAppraisals,
  type EraseClientAppraisalsError,
} from './application/handlers/erase-client-appraisals';
export {
  DeleteAppraisalPhotoFiles,
  type DeleteAppraisalPhotoFilesError,
} from './application/handlers/delete-appraisal-photo-files';
export {
  MoveMergedClientAppraisals,
  type MoveMergedClientAppraisalsError,
} from './application/handlers/move-merged-client-appraisals';
