'use server';

import {
  PortalInputSchema,
  SetPortalAccountEnabledInputSchema,
  type PortalInput,
  type SetPortalAccountEnabledInput,
} from '@norde/core/portals/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { PORTAL_ACCOUNT_ERROR_MESSAGES } from './messages';
import { PORTALS_SETTINGS_PATH } from './oauth-flow';

// Server Actions de las cuentas de portales. Cada una: actor de la sesión → contract → un caso de
// uso → mensaje → revalidar. La autorización la decide el caso de uso.

const INVALID = messageForError({ type: 'ValidationFailed' });
const HIDDEN = 'La difusión en portales no está activa.';

export async function disconnectPortalAccountAction(input: PortalInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = PortalInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals.disconnectAccount.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, PORTAL_ACCOUNT_ERROR_MESSAGES));
  }
  revalidatePath(PORTALS_SETTINGS_PATH);
  return ACTION_OK;
}

export async function setPortalAccountEnabledAction(
  input: SetPortalAccountEnabledInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = SetPortalAccountEnabledInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals.setAccountEnabled.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, PORTAL_ACCOUNT_ERROR_MESSAGES));
  }
  revalidatePath(PORTALS_SETTINGS_PATH);
  return ACTION_OK;
}
