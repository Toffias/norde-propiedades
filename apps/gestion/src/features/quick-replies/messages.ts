import type {
  CreateQuickReplyError,
  DeleteQuickReplyError,
  GetQuickReplyError,
  InvalidQuickReplyError,
  ListQuickRepliesError,
  SetQuickReplyActiveError,
  UpdateQuickReplyError,
} from '@norde/core/clients';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de las respuestas rápidas (#105) → mensajes para el usuario.

const INVALID = 'Revisá los datos y probá de nuevo.';
const FORBIDDEN = 'No tenés permiso para administrar las respuestas rápidas.';
const NOT_FOUND = 'No encontramos la respuesta rápida. Puede que la hayan borrado.';

function invalidQuickReplyMessage(error: InvalidQuickReplyError): string {
  switch (error.reason) {
    case 'name':
      return 'Ingresá un nombre de hasta 80 caracteres.';
    case 'subject':
      return 'El asunto puede tener hasta 150 caracteres.';
    case 'body':
      return 'Escribí un mensaje de hasta 1.000 caracteres.';
    case 'unknown_variables':
      return `Estas variables no existen: ${error.variables.map((v) => `[[${v}]]`).join(', ')}. Usá las de la lista.`;
  }
}

export const LIST_QUICK_REPLIES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las respuestas rápidas.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListQuickRepliesError>;

export const GET_QUICK_REPLY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las respuestas rápidas.',
  InvalidInput: INVALID,
  QuickReplyNotFound: NOT_FOUND,
} satisfies ErrorMessages<GetQuickReplyError>;

export const CREATE_QUICK_REPLY_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  InvalidQuickReply: invalidQuickReplyMessage,
} satisfies ErrorMessages<CreateQuickReplyError>;

export const UPDATE_QUICK_REPLY_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  InvalidQuickReply: invalidQuickReplyMessage,
  QuickReplyNotFound: NOT_FOUND,
} satisfies ErrorMessages<UpdateQuickReplyError>;

export const SET_QUICK_REPLY_ACTIVE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  QuickReplyNotFound: NOT_FOUND,
} satisfies ErrorMessages<SetQuickReplyActiveError>;

export const DELETE_QUICK_REPLY_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  QuickReplyNotFound: NOT_FOUND,
} satisfies ErrorMessages<DeleteQuickReplyError>;
