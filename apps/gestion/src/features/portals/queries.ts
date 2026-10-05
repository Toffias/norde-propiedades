import 'server-only';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { PORTAL_ACCOUNT_ERROR_MESSAGES } from './messages';

// Lecturas de portales para los Server Components. La autorización la decide el caso de uso.

/**
 * Las cuentas de portales para Mi empresa → Portales. `hidden` si la difusión está apagada, y el
 * mensaje si no se pueden ver.
 */
export async function loadPortalAccounts() {
  const portals = getContainer().portals;
  if (!portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await portals.listAccounts.execute({}, actor);
  return result.isOk()
    ? { kind: 'ok' as const, view: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, PORTAL_ACCOUNT_ERROR_MESSAGES),
      };
}
