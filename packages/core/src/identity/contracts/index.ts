// Contracts del módulo identity (`@norde/core/identity/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

export const USER_STATUS_VALUES = ['active', 'suspended'] as const;
export type UserStatusValue = (typeof USER_STATUS_VALUES)[number];

/** Lo mismo que exige Better Auth (`minPasswordLength`). */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
/** Un usuario tiene pocos roles; el tope evita inputs abusivos. */
export const MAX_ROLES_PER_USER = 20;

const PasswordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);
/** Primero normaliza y después valida: `z.email()` rechaza los espacios antes de recortarlos. */
const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const SignInInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type SignInInput = z.input<typeof SignInInputSchema>;

const UserProfileFields = {
  name: z.string().trim().min(1).max(120),
  email: EmailSchema,
  phone: z.string().trim().min(1).max(40).optional(),
  roleIds: z.array(z.uuid()).min(1).max(MAX_ROLES_PER_USER),
};

export const CreateUserInputSchema = z.object({
  ...UserProfileFields,
  /** Se la pasa el administrador; el usuario la cambia en su primer ingreso. */
  temporaryPassword: PasswordSchema,
});
export type CreateUserInput = z.input<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z.object({ userId: z.uuid(), ...UserProfileFields });
export type UpdateUserInput = z.input<typeof UpdateUserInputSchema>;

export const UserIdInputSchema = z.object({ userId: z.uuid() });
export type UserIdInput = z.input<typeof UserIdInputSchema>;

export const ResetUserPasswordInputSchema = z.object({
  userId: z.uuid(),
  temporaryPassword: PasswordSchema,
});
export type ResetUserPasswordInput = z.input<typeof ResetUserPasswordInputSchema>;

export const ChangeOwnPasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: PasswordSchema,
});
export type ChangeOwnPasswordInput = z.input<typeof ChangeOwnPasswordInputSchema>;

export const USER_SORT_FIELDS = ['name', 'email', 'lastLoginAt', 'createdAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export const ListUsersQuerySchema = pageQuerySchema({
  sortable: USER_SORT_FIELDS,
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  status: z.enum(USER_STATUS_VALUES).default('active'),
  /** Nombre o email. */
  q: z.string().trim().min(1).max(100).optional(),
});
export type ListUsersQuery = z.input<typeof ListUsersQuerySchema>;

export const ROLE_SORT_FIELDS = ['name'] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

/** `trash`: la papelera de roles borrados. */
export const ROLE_VIEW_VALUES = ['active', 'trash'] as const;
export type RoleViewValue = (typeof ROLE_VIEW_VALUES)[number];

export const ListRolesQuerySchema = pageQuerySchema({
  sortable: ROLE_SORT_FIELDS,
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  q: z.string().trim().min(1).max(100).optional(),
  view: z.enum(ROLE_VIEW_VALUES).default('active'),
});
export type ListRolesQuery = z.input<typeof ListRolesQuerySchema>;

export const PERMISSION_EFFECT_VALUES = ['grant', 'deny'] as const;
export type PermissionEffectValue = (typeof PERMISSION_EFFECT_VALUES)[number];

/** El catálogo tiene un centenar de permisos: el tope solo frena inputs abusivos. */
export const MAX_PERMISSIONS = 300;
const PermissionSchema = z.string().trim().min(3).max(80);

const RoleFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300).optional(),
  permissions: z.array(PermissionSchema).max(MAX_PERMISSIONS),
};

export const CreateRoleInputSchema = z.object(RoleFields);
export type CreateRoleInput = z.input<typeof CreateRoleInputSchema>;

export const UpdateRoleInputSchema = z.object({ roleId: z.uuid(), ...RoleFields });
export type UpdateRoleInput = z.input<typeof UpdateRoleInputSchema>;

export const RoleIdInputSchema = z.object({ roleId: z.uuid() });
export type RoleIdInput = z.input<typeof RoleIdInputSchema>;

export const SetUserPermissionsInputSchema = z.object({
  userId: z.uuid(),
  permissions: z
    .array(z.object({ permission: PermissionSchema, effect: z.enum(PERMISSION_EFFECT_VALUES) }))
    .max(MAX_PERMISSIONS),
});
export type SetUserPermissionsInput = z.input<typeof SetUserPermissionsInputSchema>;

/** Rol completo, para el editor: sus permisos están acotados por el catálogo. */
export interface RoleDetail {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly isSystem: boolean;
  readonly permissions: readonly string[];
  readonly deletedAt: Date | undefined;
}

/** Permisos de un usuario: los que le dan sus roles y los propios (permitir o denegar). */
export interface UserPermissionsDetail {
  readonly userId: string;
  readonly name: string;
  readonly rolePermissions: readonly string[];
  /** Permisos del catálogo que le dan sus roles (también por un `recurso:*`). */
  readonly grantedByRoles: readonly string[];
  readonly ownPermissions: readonly {
    readonly permission: string;
    readonly effect: PermissionEffectValue;
  }[];
}

export interface RoleSummary {
  readonly key: string;
  readonly name: string;
}

export interface UserRole {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

/** Fila del listado de usuarios. */
export interface UserListItem {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | undefined;
  readonly status: UserStatusValue;
  readonly roles: readonly UserRole[];
  readonly mustChangePassword: boolean;
  readonly lastLoginAt: Date | undefined;
  readonly createdAt: Date;
}

/** Fila del listado de roles. */
export interface RoleListItem {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly isSystem: boolean;
  readonly userCount: number;
  /** Solo en la papelera. */
  readonly deletedAt: Date | undefined;
}

/** Quién está usando el panel: lo que muestra el menú de la cuenta. */
export interface SessionProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly RoleSummary[];
  /** Entró con una contraseña temporal: no puede hacer nada hasta cambiarla. */
  readonly mustChangePassword: boolean;
}
