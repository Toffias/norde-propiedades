import type {
  CheckClientDuplicatesError,
  CreateClientError,
  DeleteClientError,
  ExportClientsError,
  GetClientDetailError,
  ListClientHistoryError,
  ListClientsError,
  ReassignClientError,
  RestoreClientError,
  UpdateClientDetailsError,
} from '@norde/core/clients';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la agenda de contactos → mensajes para el usuario.

const FORBIDDEN = 'No tenés permiso para hacer esto con este contacto.';
const INVALID = 'Revisá los datos marcados y probá de nuevo.';
const NOT_FOUND = 'No encontramos el contacto. Puede que lo hayan borrado.';
const DUPLICATE = (error: { readonly trashed: boolean }) =>
  error.trashed
    ? 'Ya hay un contacto en la papelera con ese teléfono o email. Restauralo en vez de crear otro.'
    : 'Ya hay un contacto con ese teléfono o email.';

export const CLIENT_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estos contactos.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListClientsError>;

export const CLIENT_DETAIL_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
} satisfies ErrorMessages<GetClientDetailError>;

export const CLIENT_HISTORY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver el historial de este contacto.',
  InvalidInput: 'Los filtros no son válidos.',
  ClientNotFound: NOT_FOUND,
} satisfies ErrorMessages<ListClientHistoryError>;

export const CHECK_DUPLICATES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para crear contactos.',
  InvalidInput: INVALID,
} satisfies ErrorMessages<CheckClientDuplicatesError>;

export const CREATE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para crear contactos o asignarlos a otro agente.',
  InvalidInput: INVALID,
  InvalidPhone: 'Uno de los teléfonos no es válido.',
  InvalidEmail: 'Uno de los emails no es válido.',
  MissingName: 'Ingresá el nombre.',
  MissingContactInfo: 'Cargá al menos un teléfono o un email.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
  DuplicateClient: DUPLICATE,
} satisfies ErrorMessages<CreateClientError>;

export const UPDATE_CLIENT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  InvalidPhone: 'Uno de los teléfonos no es válido.',
  InvalidEmail: 'Uno de los emails no es válido.',
  ClientNotFound: NOT_FOUND,
  ClientInTrash: 'El contacto está en la papelera: restauralo para editarlo.',
  MissingName: 'Ingresá el nombre.',
  MissingContactInfo: 'El contacto tiene que tener al menos un teléfono o un email.',
  DuplicateClient: (error) =>
    error.trashed
      ? 'Ese teléfono o email es de un contacto que está en la papelera.'
      : 'Ese teléfono o email ya es de otro contacto.',
} satisfies ErrorMessages<UpdateClientDetailsError>;

export const REASSIGN_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para cambiar el agente de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: 'El contacto está en la papelera: restauralo para cambiar el agente.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
} satisfies ErrorMessages<ReassignClientError>;

export const DELETE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para borrar este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  ClientAlreadyDeleted: 'El contacto ya estaba en la papelera.',
} satisfies ErrorMessages<DeleteClientError>;

export const RESTORE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para restaurar este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  ClientNotDeleted: 'El contacto ya no estaba en la papelera.',
} satisfies ErrorMessages<RestoreClientError>;

export const EXPORT_CLIENTS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para exportar contactos.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  NothingToExport: 'No hay contactos para exportar con estos filtros.',
  TooManyToExport: (error) =>
    `Son ${error.total.toLocaleString('es-AR')} contactos y el máximo es ${error.max.toLocaleString('es-AR')}. Filtrá un poco más.`,
} satisfies ErrorMessages<ExportClientsError>;
