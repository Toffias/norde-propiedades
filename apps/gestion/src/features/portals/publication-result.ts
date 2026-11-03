import { UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';

/**
 * Lo que devuelve publicar una propiedad: como un `ActionResult`, y si el portal ya tiene online un
 * aviso de la propiedad, su número, para ofrecer vincularlo en vez de publicar otro.
 */
export type PublicationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly existingRemoteId: string | undefined };

/** Desde la ficha: corre la acción; una excepción ya quedó logueada en el servidor. */
export async function runPublication(
  action: () => Promise<PublicationResult>,
): Promise<PublicationResult> {
  try {
    return await action();
  } catch {
    return { ok: false, message: UNEXPECTED_ERROR_MESSAGE, existingRemoteId: undefined };
  }
}
