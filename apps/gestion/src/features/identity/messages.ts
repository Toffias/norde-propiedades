import type {
  ChangeOwnPasswordError,
  CreateRoleError,
  CreateUserError,
  DeleteRoleError,
  GetRoleError,
  GetUserPermissionsError,
  ReactivateUserError,
  ResetUserPasswordError,
  RestoreRoleError,
  SetUserPermissionsError,
  SuspendUserError,
  UpdateRoleError,
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
  | ChangeOwnPasswordError
  | SetUserPermissionsError
  | GetUserPermissionsError;

type RoleError =
  CreateRoleError | UpdateRoleError | DeleteRoleError | RestoreRoleError | GetRoleError;

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
  UnknownPermission: ({ permission }) => `El permiso ${permission} no existe.`,
  DuplicatePermission: ({ permission }) => `El permiso ${permission} aparece dos veces.`,
  CannotChangeOwnPermissions:
    'No podés cambiar tus propios permisos: pedíselo a otro administrador.',
} satisfies ErrorMessages<UserError>;

export const ROLE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para administrar roles.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  RoleNotFound: 'No encontramos ese rol. Puede que lo hayan borrado.',
  RoleNameTaken: 'Ya hay un rol con ese nombre (fijate también en la papelera).',
  UnknownPermission: ({ permission }) => `El permiso ${permission} no existe.`,
  SystemRoleCannotBeRenamed:
    'Los roles del sistema no se renombran; sí podés ajustar sus permisos.',
  SystemRoleCannotBeDeleted: 'Los roles del sistema no se pueden borrar.',
  RoleInUse: ({ userCount }) =>
    userCount === 1
      ? 'Hay 1 usuario con este rol: asignale otro antes de borrarlo.'
      : `Hay ${String(userCount)} usuarios con este rol: asignales otro antes de borrarlo.`,
  RoleAlreadyDeleted: 'El rol ya estaba en la papelera.',
  RoleNotDeleted: 'El rol no está en la papelera.',
} satisfies ErrorMessages<RoleError>;
