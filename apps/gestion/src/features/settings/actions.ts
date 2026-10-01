'use server';

import {
  ChangeLogoInputSchema,
  ChangeReferenceCodePrefixInputSchema,
  ConfigureWatermarkInputSchema,
  CreateFolderInputSchema,
  CreateReferenceCodeSequenceInputSchema,
  DeleteReferenceCodeSequenceInputSchema,
  FileIdInputSchema,
  FolderIdInputSchema,
  PreviewWatermarkInputSchema,
  RenameCompanyFileInputSchema,
  RenameFolderInputSchema,
  SearchDirectoryQuerySchema,
  SendTestEmailInputSchema,
  UpdateEmailSenderInputSchema,
  UpdateGeneralSettingsInputSchema,
  UpdatePdfOptionsInputSchema,
  UpdatePortalDescriptionFooterInputSchema,
  type ChangeReferenceCodePrefixInput,
  type ConfigureWatermarkInput,
  type CreateFolderInput,
  type CreateReferenceCodeSequenceInput,
  type DeleteReferenceCodeSequenceInput,
  type FileIdInput,
  type FolderIdInput,
  type RenameCompanyFileInput,
  type RenameFolderInput,
  type SearchDirectoryQuery,
  type SendTestEmailInput,
  type UpdateEmailSenderInput,
  type UpdateGeneralSettingsInput,
  type UpdatePdfOptionsInput,
  type UpdatePortalDescriptionFooterInput,
} from '@norde/core/settings/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  COMPANY_FILES_ERROR_MESSAGES,
  COMPANY_SETTINGS_ERROR_MESSAGES,
  REFERENCE_CODE_ERROR_MESSAGES,
} from './messages';

// Server Actions de Mi empresa. Cada una: actor de la sesión → contract → un caso de uso →
// mensaje → revalidar. La autorización la decide el caso de uso.

const COMPANY_PATH = '/mi-empresa';
const FILES_PATH = '/mi-empresa/archivos';
const INVALID = messageForError({ type: 'ValidationFailed' });

function settings() {
  return getContainer().settings;
}

/** Un archivo de un `FormData` como lo esperan los contracts: nombre, tipo y bytes. */
async function fileFrom(form: FormData, field: string) {
  const value = form.get(field);
  if (!(value instanceof File)) return undefined;
  return {
    fileName: value.name,
    contentType: value.type,
    bytes: new Uint8Array(await value.arrayBuffer()),
  };
}

function optionalText(form: FormData, field: string): string | undefined {
  const value = form.get(field);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// ---------- Configuración ----------

export async function updateGeneralSettingsAction(
  input: UpdateGeneralSettingsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateGeneralSettingsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().updateGeneralSettings.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

/** Sube el logo (campo `image`) o, sin archivo, lo quita. */
export async function changeLogoAction(
  which: 'company' | 'watermark',
  form: FormData,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const image = await fileFrom(form, 'image');
  const parsed = ChangeLogoInputSchema.safeParse(image === undefined ? {} : { image });
  if (!parsed.success) return actionFailed(INVALID);
  const useCase =
    which === 'company' ? settings().changeCompanyLogo : settings().changeWatermarkLogo;

  const result = await useCase.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

export async function configureWatermarkAction(
  input: ConfigureWatermarkInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ConfigureWatermarkInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().configureWatermark.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

export type PreviewResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly message: string };

/** Vista previa de la marca de agua sobre la foto `photo`, con las opciones sin guardar. */
export async function previewWatermarkAction(form: FormData): Promise<PreviewResult> {
  const { actor } = await requireSession();
  const photo = await fileFrom(form, 'photo');
  const parsed = PreviewWatermarkInputSchema.safeParse({
    photo: photo && { contentType: photo.contentType, bytes: photo.bytes },
    options: {
      enabled: true,
      sizePercent: form.get('sizePercent'),
      position: form.get('position'),
      opacity: form.get('opacity'),
    },
  });
  if (!parsed.success) return { ok: false, message: INVALID };

  const result = await settings().previewWatermark.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES) };
  }
  const base64 = Buffer.from(result.value.bytes).toString('base64');
  return { ok: true, dataUrl: `data:${result.value.contentType};base64,${base64}` };
}

export async function updatePortalDescriptionFooterAction(
  input: UpdatePortalDescriptionFooterInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePortalDescriptionFooterInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().updatePortalDescriptionFooter.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

export async function updatePdfOptionsAction(input: UpdatePdfOptionsInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePdfOptionsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().updatePdfOptions.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

export async function updateEmailSenderAction(
  input: UpdateEmailSenderInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateEmailSenderInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().updateEmailSender.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  revalidatePath(COMPANY_PATH, 'layout');
  return ACTION_OK;
}

export async function sendTestEmailAction(input: SendTestEmailInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SendTestEmailInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().sendTestEmail.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_SETTINGS_ERROR_MESSAGES));
  }
  return ACTION_OK;
}

// ---------- Códigos de referencia ----------

const CODES_PATH = '/mi-empresa/codigos';

export async function createReferenceCodeSequenceAction(
  input: CreateReferenceCodeSequenceInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateReferenceCodeSequenceInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().createReferenceCodeSequence.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REFERENCE_CODE_ERROR_MESSAGES));
  }
  revalidatePath(CODES_PATH);
  return ACTION_OK;
}

export async function changeReferenceCodePrefixAction(
  input: ChangeReferenceCodePrefixInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeReferenceCodePrefixInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().changeReferenceCodePrefix.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REFERENCE_CODE_ERROR_MESSAGES));
  }
  revalidatePath(CODES_PATH);
  return ACTION_OK;
}

export async function deleteReferenceCodeSequenceAction(
  input: DeleteReferenceCodeSequenceInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = DeleteReferenceCodeSequenceInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().deleteReferenceCodeSequence.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REFERENCE_CODE_ERROR_MESSAGES));
  }
  revalidatePath(CODES_PATH);
  return ACTION_OK;
}

export interface DirectoryPage {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly hasMore: boolean;
}

/** Página del buscador de usuarios, equipos o sucursales (para `PagedCombobox`). */
export async function searchDirectoryAction(input: SearchDirectoryQuery): Promise<DirectoryPage> {
  const { actor } = await requireSession();
  const parsed = SearchDirectoryQuerySchema.safeParse(input);
  if (!parsed.success) return { options: [], hasMore: false };

  const result = await settings().searchDirectory.execute(input, actor);
  if (result.isErr()) return { options: [], hasMore: false };
  const { items, total, page, pageSize } = result.value;
  return {
    options: items.map((entry) => ({ value: entry.id, label: entry.name })),
    hasMore: page * pageSize < total,
  };
}

// ---------- Gestor de archivos ----------

export async function createFolderAction(input: CreateFolderInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateFolderInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().createFolder.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH);
  return ACTION_OK;
}

export async function renameFolderAction(input: RenameFolderInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RenameFolderInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().renameFolder.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH);
  return ACTION_OK;
}

export async function deleteFolderAction(input: FolderIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FolderIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().deleteFolder.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH);
  return ACTION_OK;
}

/** Sube el archivo del campo `file` a la carpeta `folderId` (sin carpeta, a la raíz). */
export async function uploadCompanyFileAction(form: FormData): Promise<ActionResult> {
  const { actor } = await requireSession();
  const file = await fileFrom(form, 'file');
  if (!file) return actionFailed(INVALID);

  // El caso de uso valida el contract (nombre, tamaño y tipo).
  const folderId = optionalText(form, 'folderId');
  const result = await settings().uploadCompanyFile.execute(
    folderId === undefined ? file : { ...file, folderId },
    actor,
  );
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH);
  return ACTION_OK;
}

export async function renameCompanyFileAction(
  input: RenameCompanyFileInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RenameCompanyFileInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().renameCompanyFile.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH);
  return ACTION_OK;
}

export async function moveCompanyFileToTrashAction(input: FileIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FileIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().moveCompanyFileToTrash.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH, 'layout');
  return ACTION_OK;
}

export async function restoreCompanyFileAction(input: FileIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FileIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await settings().restoreCompanyFile.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES));
  }
  revalidatePath(FILES_PATH, 'layout');
  return ACTION_OK;
}
