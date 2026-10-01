import type {
  AddTeamMemberError,
  ChangeOwnPasswordError,
  CreateBranchError,
  CreateTeamError,
  DeleteBranchError,
  DeleteTeamError,
  GetBranchError,
  GetTeamError,
  MakeMainBranchError,
  RemoveTeamMemberError,
  RestoreBranchError,
  RestoreTeamError,
  UpdateBranchError,
  UpdateTeamError,
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
  BranchNotFound: 'La sucursal elegida ya no existe. Recargá la página y elegí otra.',
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

type BranchError =
  | CreateBranchError
  | UpdateBranchError
  | MakeMainBranchError
  | DeleteBranchError
  | RestoreBranchError
  | GetBranchError;

export const BRANCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para administrar sucursales.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  InvalidEmail: 'El email no es válido.',
  InvalidPhone: 'Un teléfono no es válido. Probá con el código de área, por ejemplo 11 6689-9124.',
  BranchNotFound: 'No encontramos esa sucursal. Puede que la hayan borrado.',
  NameTaken: 'Ya hay una sucursal con ese nombre.',
  MainBranchCannotBeDeleted:
    'La casa central no se borra: marcá otra sucursal como principal antes.',
  BranchHasMembers: ({ userCount }) =>
    userCount === 1
      ? 'Hay 1 usuario en esta sucursal: pasalo a otra antes de borrarla.'
      : `Hay ${String(userCount)} usuarios en esta sucursal: pasalos a otra antes de borrarla.`,
  BranchHasTeams: ({ teamCount }) =>
    teamCount === 1
      ? 'Hay 1 equipo en esta sucursal: movelo o borralo antes.'
      : `Hay ${String(teamCount)} equipos en esta sucursal: movelos o borralos antes.`,
  BranchAlreadyDeleted: 'La sucursal ya estaba en la papelera.',
  BranchNotDeleted: 'La sucursal no está en la papelera.',
} satisfies ErrorMessages<BranchError>;

type TeamError =
  | CreateTeamError
  | UpdateTeamError
  | DeleteTeamError
  | RestoreTeamError
  | AddTeamMemberError
  | RemoveTeamMemberError
  | GetTeamError;

export const TEAM_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para administrar equipos.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  TeamNotFound: 'No encontramos ese equipo. Puede que lo hayan borrado.',
  BranchNotFound: 'La sucursal elegida ya no existe. Elegí otra.',
  UserNotFound: 'No encontramos ese usuario.',
  NameTaken: 'Ya hay un equipo con ese nombre.',
  TeamDeleted: 'El equipo está en la papelera: restauralo para cambiar sus miembros.',
  TeamAlreadyDeleted: 'El equipo ya estaba en la papelera.',
  TeamNotDeleted: 'El equipo no está en la papelera.',
} satisfies ErrorMessages<TeamError>;
