import { UNEXPECTED_ERROR_MESSAGE } from './errors';

// Respuesta de una Server Action a la UI: o salió bien, o un mensaje en español para mostrar.
// Los errores inesperados no llegan acá: se lanzan, se loguean y la UI muestra un mensaje genérico.

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export const ACTION_OK: ActionResult = { ok: true };

export function actionFailed(message: string): ActionResult {
  return { ok: false, message };
}

/**
 * Desde un componente cliente: corre la Server Action y devuelve el mensaje de error, o `undefined`
 * si salió bien. Una excepción ya quedó logueada en el servidor; acá se muestra un mensaje genérico.
 */
export async function runAction(action: () => Promise<ActionResult>): Promise<string | undefined> {
  try {
    const result = await action();
    return result.ok ? undefined : result.message;
  } catch {
    return UNEXPECTED_ERROR_MESSAGE;
  }
}
