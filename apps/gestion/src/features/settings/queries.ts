import 'server-only';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

// Lecturas de Mi empresa para los Server Components. La autorización la decide el caso de uso.

/** La configuración de la empresa, o el mensaje para mostrar si no se puede ver. */
export async function loadCompanySettings() {
  const { actor } = await requireSession();
  const result = await getContainer().settings.getCompanySettings.execute({}, actor);
  return result.isOk()
    ? { ok: true as const, settings: result.value, canUpdate: actor.can('settings:update') }
    : { ok: false as const, message: messageForError(result.error) };
}
