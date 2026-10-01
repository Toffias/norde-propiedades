'use server';

import {
  BranchIdInputSchema,
  ChangeOwnPasswordInputSchema,
  CreateBranchInputSchema,
  CreateTeamInputSchema,
  TeamIdInputSchema,
  TeamMemberInputSchema,
  UpdateBranchInputSchema,
  UpdateTeamInputSchema,
  type BranchIdInput,
  type CreateBranchInput,
  type CreateTeamInput,
  type TeamIdInput,
  type TeamMemberInput,
  type UpdateBranchInput,
  type UpdateTeamInput,
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
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';

import {
  BRANCH_ERROR_MESSAGES,
  ROLE_ERROR_MESSAGES,
  TEAM_ERROR_MESSAGES,
  USER_ERROR_MESSAGES,
} from './messages';

// Server Actions de usuarios y roles. Cada una: actor de la sesión → contract → un caso de uso →
// mensaje → revalidar. La autorización la decide el caso de uso.

const USERS_PATH = '/mi-empresa/usuarios';
const ROLES_PATH = '/mi-empresa/roles';
const BRANCHES_PATH = '/mi-empresa/sucursales';
const TEAMS_PATH = '/mi-empresa/equipos';
/** Opciones por página de los selectores con búsqueda. */
const PICKER_PAGE_SIZE = 20;
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

// --- Sucursales ---

export async function createBranchAction(input: CreateBranchInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateBranchInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.createBranch.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, BRANCH_ERROR_MESSAGES));
  revalidatePath(BRANCHES_PATH);
  return ACTION_OK;
}

export async function updateBranchAction(input: UpdateBranchInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateBranchInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.updateBranch.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, BRANCH_ERROR_MESSAGES));
  revalidatePath(BRANCHES_PATH);
  return ACTION_OK;
}

export async function makeMainBranchAction(input: BranchIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = BranchIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.makeMainBranch.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, BRANCH_ERROR_MESSAGES));
  revalidatePath(BRANCHES_PATH);
  return ACTION_OK;
}

export async function deleteBranchAction(input: BranchIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = BranchIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.deleteBranch.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, BRANCH_ERROR_MESSAGES));
  revalidatePath(BRANCHES_PATH);
  return ACTION_OK;
}

export async function restoreBranchAction(input: BranchIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = BranchIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.restoreBranch.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, BRANCH_ERROR_MESSAGES));
  revalidatePath(BRANCHES_PATH);
  return ACTION_OK;
}

/** Selector de sucursal: una página de sucursales vigentes que coinciden con la búsqueda. */
export async function loadBranchOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().identity.listBranches.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the branches: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((branch) => ({
      value: branch.id,
      label: branch.name,
      ...(branch.address === undefined ? {} : { hint: branch.address }),
    })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

// --- Equipos ---

export async function createTeamAction(input: CreateTeamInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateTeamInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.createTeam.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

export async function updateTeamAction(input: UpdateTeamInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateTeamInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.updateTeam.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

export async function deleteTeamAction(input: TeamIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = TeamIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.deleteTeam.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

export async function restoreTeamAction(input: TeamIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = TeamIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.restoreTeam.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

export async function addTeamMemberAction(input: TeamMemberInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = TeamMemberInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.addTeamMember.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

export async function removeTeamMemberAction(input: TeamMemberInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = TeamMemberInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().identity.removeTeamMember.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, TEAM_ERROR_MESSAGES));
  revalidatePath(TEAMS_PATH, 'layout');
  return ACTION_OK;
}

/** Selector de miembros: una página de usuarios activos que coinciden con la búsqueda. */
export async function loadUserOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().identity.listUsers.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the users: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((user) => ({ value: user.id, label: user.name, hint: user.email })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}
