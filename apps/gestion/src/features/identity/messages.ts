import type {
  ChangeOwnPasswordError,
  CreateUserError,
  ReactivateUserError,
  ResetUserPasswordError,
  SuspendUserError,
  UpdateUserError,
} from '@norde/core/identity';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de los casos de uso de usuarios → mensajes para la UI.

type UserError =
  | CreateUserError
  | UpdateUserError
  | SuspendUserError
  | ReactivateUserError
  | ResetUserPasswordError
  | ChangeOwnPasswordError;

export const USER_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para administrar usuarios.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  InvalidEmail: 'El email no es válido.',
  InvalidPhone: 'El teléfono no es válido. Probá con el código de área, por ejemplo 11 6689-9124.',
  EmailTaken: 'Ya hay un usuario con ese email.',
  RoleNotFound: 'Uno de los roles elegidos ya no existe. Recargá la página y elegilos de nuevo.',
  UserNeedsRole: 'Elegí al menos un rol.',
  UserNotFound: 'No encontramos ese usuario. Puede que lo hayan eliminado.',
  CannotSuspendSelf: 'No podés suspenderte a vos mismo: pedíselo a otro administrador.',
  UserAlreadySuspended: 'El usuario ya estaba suspendido.',
  UserAlreadyActive: 'El usuario ya estaba activo.',
  WrongPassword: 'La contraseña actual no es correcta.',
  SamePassword: 'La contraseña nueva tiene que ser distinta de la actual.',
} satisfies ErrorMessages<UserError>;
