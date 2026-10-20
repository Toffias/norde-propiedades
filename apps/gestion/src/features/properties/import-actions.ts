'use server';

import {
  PreviewPropertyImportInputSchema,
  StartPropertyImportInputSchema,
  type PropertyImportPreview,
} from '@norde/core/properties/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  PREVIEW_PROPERTY_IMPORT_ERROR_MESSAGES,
  START_PROPERTY_IMPORT_ERROR_MESSAGES,
} from './import-messages';

const IMPORTS_PATH = '/propiedades/importaciones';

/** El archivo de un `FormData` tal como lo espera el contract. Lo lee el servidor, nunca el navegador. */
async function fileFrom(form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File)) return {};
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Primer paso: verifica que sea la exportación de Tokko y cuenta las propiedades. No guarda nada. */
export async function previewPropertyImportAction(
  form: FormData,
): Promise<
  ({ readonly ok: true } & PropertyImportPreview) | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = PreviewPropertyImportInputSchema.safeParse(await fileFrom(form));
  if (!parsed.success) {
    return { ok: false, message: PREVIEW_PROPERTY_IMPORT_ERROR_MESSAGES.InvalidInput };
  }
  const result = await getContainer().properties.previewPropertyImport.execute(parsed.data, actor);
  if (result.isErr()) {
    return {
      ok: false,
      message: messageForError(result.error, PREVIEW_PROPERTY_IMPORT_ERROR_MESSAGES),
    };
  }
  return { ok: true, ...result.value };
}

/** Segundo paso: guarda el archivo; la importación corre como job. */
export async function startPropertyImportAction(
  form: FormData,
): Promise<ActionResult & { readonly importId?: string }> {
  const { actor } = await requireSession();
  const parsed = StartPropertyImportInputSchema.safeParse(await fileFrom(form));
  if (!parsed.success) return actionFailed(START_PROPERTY_IMPORT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().properties.startPropertyImport.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, START_PROPERTY_IMPORT_ERROR_MESSAGES));
  }
  revalidatePath(IMPORTS_PATH);
  return { ...ACTION_OK, importId: result.value.importId };
}
