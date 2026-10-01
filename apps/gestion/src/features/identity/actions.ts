'use server';

import {
  ChangeOwnPasswordInputSchema,
  CreateRoleInputSchema,
  CreateUserInputSchema,
  ResetUserPasswordInputSchema,
  RoleIdInputSchema,
  SetUserPermissionsInputSchema,
  UpdateRoleInputSchema,
  UpdateUserInputSchema,
  UserIdInputSchema,
  type ChangeOwnPasswordInput,
  type CreateRoleInput,
  type CreateUserInput,
  type ResetUserPasswordInput,
  type RoleIdInput,
  type SetUserPermissionsInput,
  type UpdateRoleInput,
  type UpdateUserInput,
  type UserIdInput,
} from '@norde/core/identity/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { ROLE_ERROR_MESSAGES, USER_ERROR_MESSAGES } from './messages';

// Server Actions de usuarios y roles. Cada una: actor de la sesión → contract → un caso de uso →
// mensaje → revalidar. La autorización la decide el caso de uso.

const USERS_PATH = '/mi-empresa/usuarios';
const ROLES_PATH = '/mi-empresa/roles';
const INVALID = messageForError({ type: 'ValidationFailed' });

export async function createUserAction(input: CreateUserInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateUserInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.createUser.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH);
  return ACTION_OK;
}

export async function updateUserAction(input: UpdateUserInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateUserInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.updateUser.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH);
  return ACTION_OK;
}

export async function suspendUserAction(input: UserIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UserIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.suspendUser.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH);
  return ACTION_OK;
}

export async function reactivateUserAction(input: UserIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UserIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.reactivateUser.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH);
  return ACTION_OK;
}

export async function resetUserPasswordAction(
  input: ResetUserPasswordInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ResetUserPasswordInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.resetUserPassword.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH);
  return ACTION_OK;
}

export async function changeOwnPasswordAction(
  input: ChangeOwnPasswordInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeOwnPasswordInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.changeOwnPassword.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  // Con la contraseña propia, la sesión vuelve a tener sus permisos en todo el panel.
  revalidatePath('/', 'layout');
  return ACTION_OK;
}

export async function setUserPermissionsAction(
  input: SetUserPermissionsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SetUserPermissionsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.setUserPermissions.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, USER_ERROR_MESSAGES));
  revalidatePath(USERS_PATH, 'layout');
  return ACTION_OK;
}

export async function createRoleAction(input: CreateRoleInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateRoleInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.createRole.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, ROLE_ERROR_MESSAGES));
  revalidatePath(ROLES_PATH, 'layout');
  return ACTION_OK;
}

export async function updateRoleAction(input: UpdateRoleInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateRoleInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.updateRole.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, ROLE_ERROR_MESSAGES));
  revalidatePath(ROLES_PATH, 'layout');
  return ACTION_OK;
}

export async function deleteRoleAction(input: RoleIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RoleIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.deleteRole.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, ROLE_ERROR_MESSAGES));
  revalidatePath(ROLES_PATH, 'layout');
  return ACTION_OK;
}

export async function restoreRoleAction(input: RoleIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RoleIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.restoreRole.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, ROLE_ERROR_MESSAGES));
  revalidatePath(ROLES_PATH, 'layout');
  return ACTION_OK;
}
