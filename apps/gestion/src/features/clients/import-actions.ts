'use server';

import {
  PreviewClientImportInputSchema,
  StartClientImportInputSchema,
  type ClientImportPreview,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { PREVIEW_IMPORT_ERROR_MESSAGES, START_IMPORT_ERROR_MESSAGES } from './messages';

const IMPORTS_PATH = '/contactos/importaciones';

/** El Excel de un `FormData` tal como lo espera el contract. */
async function fileFrom(form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File)) return {};
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
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
export async function previewClientImportAction(
  form: FormData,
): Promise<
  ({ readonly ok: true } & ClientImportPreview) | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = PreviewClientImportInputSchema.safeParse(await fileFrom(form));
  if (!parsed.success) return { ok: false, message: PREVIEW_IMPORT_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().clients.previewClientImport.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, PREVIEW_IMPORT_ERROR_MESSAGES) };
  }
  return { ok: true, ...result.value };
}

/** Segundo paso: guarda el Excel con el mapeo elegido; la importación corre como job. */
export async function startClientImportAction(
  form: FormData,
): Promise<ActionResult & { readonly importId?: string }> {
  const { actor } = await requireSession();
  const agentId = form.get('agentId');
  const parsed = StartClientImportInputSchema.safeParse({
    ...(await fileFrom(form)),
    mapping: mappingFrom(form),
    ...(typeof agentId === 'string' && agentId !== '' ? { agentId } : {}),
  });
  if (!parsed.success) return actionFailed(START_IMPORT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.startClientImport.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, START_IMPORT_ERROR_MESSAGES));
  }
  revalidatePath(IMPORTS_PATH);
  return { ...ACTION_OK, importId: result.value.importId };
}
