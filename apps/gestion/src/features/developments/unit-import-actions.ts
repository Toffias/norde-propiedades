'use server';

import {
  PreviewDevelopmentUnitImportInputSchema,
  StartDevelopmentUnitImportInputSchema,
  type DevelopmentUnitImportPreview,
} from '@norde/core/properties/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { PREVIEW_UNIT_IMPORT_ERROR_MESSAGES, START_UNIT_IMPORT_ERROR_MESSAGES } from './messages';

/** El Excel y el emprendimiento de un `FormData`, tal como los espera el contract. */
async function fileFrom(form: FormData) {
  const file = form.get('file');
  const developmentId = form.get('developmentId');
  return {
    ...(typeof developmentId === 'string' ? { developmentId } : {}),
    ...(file instanceof File
      ? { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : {}),
  };
}

/** El mapeo llega como JSON en el `FormData`; uno roto lo rechaza el contract. */
function mappingFrom(form: FormData): unknown {
  const raw = form.get('mapping');
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // JSON inválido (la pantalla siempre lo arma bien): el contract lo rechaza como mapeo vacío.
    return undefined;
  }
}

/** Primer paso: lee el Excel y propone el mapeo. No guarda nada. */
export async function previewUnitImportAction(
  form: FormData,
): Promise<
  | ({ readonly ok: true } & DevelopmentUnitImportPreview)
  | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = PreviewDevelopmentUnitImportInputSchema.safeParse(await fileFrom(form));
  if (!parsed.success) {
    return { ok: false, message: PREVIEW_UNIT_IMPORT_ERROR_MESSAGES.InvalidInput };
  }

  const result = await getContainer().properties.previewDevelopmentUnitImport.execute(
    parsed.data,
    actor,
  );
  if (result.isErr()) {
    return {
      ok: false,
      message: messageForError(result.error, PREVIEW_UNIT_IMPORT_ERROR_MESSAGES),
    };
  }
  return { ok: true, ...result.value };
}

/** Segundo paso: guarda el Excel con el mapeo elegido; la importación corre como job. */
export async function startUnitImportAction(
  form: FormData,
): Promise<ActionResult & { readonly importId?: string }> {
  const { actor } = await requireSession();
  const parsed = StartDevelopmentUnitImportInputSchema.safeParse({
    ...(await fileFrom(form)),
    mapping: mappingFrom(form),
  });
  if (!parsed.success) return actionFailed(START_UNIT_IMPORT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().properties.startDevelopmentUnitImport.execute(
    parsed.data,
    actor,
  );
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, START_UNIT_IMPORT_ERROR_MESSAGES));
  }
  revalidatePath(`/emprendimientos/${parsed.data.developmentId}`, 'layout');
  return { ...ACTION_OK, importId: result.value.importId };
}
