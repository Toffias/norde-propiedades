import type {
  DeleteInquiryError,
  ListInquiriesError,
  RestoreInquiryError,
} from '@norde/core/clients';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la bandeja de consultas → mensajes para el usuario.

const INVALID = 'Revisá los datos y probá de nuevo.';
const NOT_FOUND = 'No encontramos la consulta. Puede que la hayan borrado.';

export const INQUIRY_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las consultas.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListInquiriesError>;

export const DELETE_INQUIRY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para borrar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
  InquiryAlreadyDeleted: 'La consulta ya estaba en Borradas.',
} satisfies ErrorMessages<DeleteInquiryError>;

export const RESTORE_INQUIRY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para restaurar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
  InquiryNotDeleted: 'La consulta ya no está en Borradas.',
} satisfies ErrorMessages<RestoreInquiryError>;
