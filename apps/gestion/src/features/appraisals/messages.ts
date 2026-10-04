import type {
  ChangeAppraisalStatusError,
  ConvertAppraisalToListingError,
  CreateAppraisalError,
  DeleteAppraisalError,
  DeleteAppraisalPhotoError,
  GetAppraisalError,
  ListAppraisalHistoryError,
  ListAppraisalsError,
  RecordAppraisalResultError,
  RestoreAppraisalError,
  UpdateAppraisalError,
  UploadAppraisalPhotoError,
} from '@norde/core/appraisals';

import type { ErrorMessages } from '../../lib/errors';
import { APPRAISAL_STATUS_DISPLAY } from './labels';

// Errores esperados de las tasaciones (#12) → mensajes para la UI.

export const APPRAISAL_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer esto con las tasaciones.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  AppraisalNotFound: 'No encontramos esa tasación. Puede que la hayan borrado.',
  ProducerNotFound: 'Ese productor no existe o está suspendido.',
  AppraiserNotFound: 'Ese tasador no existe o está suspendido.',
  NegativeAppraisalMeasure: 'Las superficies y los ambientes no pueden ser negativos.',
  VisitDateRequired: 'Para agendar la visita, cargá su fecha y hora.',
  AppraisalConverted: 'La tasación ya se convirtió en propiedad: no se edita.',
  AppraisalDeleted: 'La tasación está en la papelera: restaurala para editarla.',
  InvalidAppraisalTransition: (error) =>
    `Una tasación ${APPRAISAL_STATUS_DISPLAY[error.from].label.toLowerCase()} no pasa a ${APPRAISAL_STATUS_DISPLAY[error.to].label.toLowerCase()}.`,
  AppraisalAlreadyDeleted: 'La tasación ya estaba en la papelera.',
  AppraisalNotDeleted: 'La tasación no está en la papelera.',
  AppraisalValueRequired:
    'Para marcarla tasada hace falta un valor sugerido de venta o de alquiler. Cargalo en Resultado.',
  AppraisalNotAppraised: 'Solo se convierte en propiedad una tasación tasada.',
  InvalidValueRange: (error) =>
    `El valor de ${error.operation === 'sale' ? 'venta' : 'alquiler'} no es válido: el mínimo no puede superar al máximo.`,
  InvalidComparable: (error) =>
    `Revisá el comparable ${String(error.index + 1)}: necesita dirección y un precio válido.`,
  TooManyComparables: (error) => `Cargá hasta ${String(error.max)} comparables.`,
  UnsupportedPhotoType: 'Subí una foto en JPG, PNG o WebP.',
  PhotoTooLarge: (error) =>
    `La foto pesa más de ${Math.round(error.maxBytes / (1024 * 1024)).toString()} MB.`,
  TooManyPhotos: (error) => `La tasación ya tiene ${String(error.max)} fotos, el máximo.`,
  AppraisalPhotoNotFound: 'No encontramos esa foto. Puede que ya la hayan borrado.',
} satisfies ErrorMessages<
  | CreateAppraisalError
  | UpdateAppraisalError
  | ChangeAppraisalStatusError
  | DeleteAppraisalError
  | RestoreAppraisalError
  | RecordAppraisalResultError
  | UploadAppraisalPhotoError
  | DeleteAppraisalPhotoError
  | ConvertAppraisalToListingError
>;

export const APPRAISAL_READ_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las tasaciones.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  AppraisalNotFound: 'No encontramos esa tasación.',
} satisfies ErrorMessages<ListAppraisalsError | GetAppraisalError | ListAppraisalHistoryError>;
