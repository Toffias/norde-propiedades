'use server';

import {
  LinkPortalListingInputSchema,
  type LinkPortalListingInput,
  ChangeListingPlanInputSchema,
  ChangeListingTypeInputSchema,
  ConnectPortalAccountWithCodeInputSchema,
  ListingIdInputSchema,
  PortalInputSchema,
  RequestPublicationInputSchema,
  SetPortalAccountEnabledInputSchema,
  type ChangeListingPlanInput,
  type ChangeListingTypeInput,
  type ConnectPortalAccountWithCodeInput,
  type ListingIdInput,
  type PortalInput,
  type RequestPublicationInput,
  type SetPortalAccountEnabledInput,
} from '@norde/core/portals/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  LINK_LISTING_ERROR_MESSAGES,
  CODE_CONNECTION_ERROR_MESSAGES,
  LISTING_ERROR_MESSAGES,
  PLAN_CHANGE_ERROR_MESSAGES,
  PORTAL_ACCOUNT_ERROR_MESSAGES,
  PUBLICATION_ERROR_MESSAGES,
} from './messages';
import { PORTALS_SETTINGS_PATH } from './oauth-flow';

// Server Actions de las cuentas de portales. Cada una: actor de la sesión → contract → un caso de
// uso → mensaje → revalidar. La autorización la decide el caso de uso.

const INVALID = messageForError({ type: 'ValidationFailed' });
const HIDDEN = 'La difusión en portales no está activa.';

/** Conecta la cuenta de un portal donde Norde es integrador, por su código (Zonaprop). */
export async function connectPortalAccountWithCodeAction(
  input: ConnectPortalAccountWithCodeInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = ConnectPortalAccountWithCodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailed(parsed.error.issues[0]?.message ?? INVALID);
  }

  const result = await portals.connectAccountWithCode.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CODE_CONNECTION_ERROR_MESSAGES));
  }
  revalidatePath(PORTALS_SETTINGS_PATH);
  return ACTION_OK;
}

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

// ---------- Publicaciones (pestaña Difusión de la ficha) ----------

/** Todas las fichas: la publicación es de una propiedad, y la acción no recibe la URL. */
function revalidateProperty() {
  revalidatePath('/propiedades/[id]', 'page');
}

export async function requestPublicationAction(
  input: RequestPublicationInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = RequestPublicationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals.requestPublication.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, PUBLICATION_ERROR_MESSAGES));
  }
  revalidateProperty();
  return ACTION_OK;
}

type ListingAction = 'pauseListing' | 'resumeListing' | 'unpublishListing' | 'resyncListing';

async function runListingAction(action: ListingAction, input: ListingIdInput) {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = ListingIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals[action].execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, LISTING_ERROR_MESSAGES));
  revalidateProperty();
  return ACTION_OK;
}

export async function pauseListingAction(input: ListingIdInput): Promise<ActionResult> {
  return runListingAction('pauseListing', input);
}

export async function resumeListingAction(input: ListingIdInput): Promise<ActionResult> {
  return runListingAction('resumeListing', input);
}

export async function unpublishListingAction(input: ListingIdInput): Promise<ActionResult> {
  return runListingAction('unpublishListing', input);
}

export async function resyncListingAction(input: ListingIdInput): Promise<ActionResult> {
  return runListingAction('resyncListing', input);
}

export async function changeListingTypeAction(
  input: ChangeListingTypeInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = ChangeListingTypeInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals.changeListingType.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, LISTING_ERROR_MESSAGES));
  revalidateProperty();
  return ACTION_OK;
}

/** Cambia el plan del aviso en los portales con plan (Zonaprop): consume un crédito del plan nuevo. */
export async function changeListingPlanAction(
  input: ChangeListingPlanInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = ChangeListingPlanInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await portals.changeListingPlan.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, PLAN_CHANGE_ERROR_MESSAGES));
  }
  revalidateProperty();
  return ACTION_OK;
}

/** Vincula a una propiedad un aviso que ya está online en el portal (lo publicó Tokko). */
export async function linkPortalListingAction(
  input: LinkPortalListingInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const portals = getContainer().portals;
  if (!portals) return actionFailed(HIDDEN);
  const parsed = LinkPortalListingInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(parsed.error.issues[0]?.message ?? INVALID);

  const result = await portals.linkListing.execute(input, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, LINK_LISTING_ERROR_MESSAGES));
  }
  revalidateProperty();
  revalidatePath(PORTALS_SETTINGS_PATH, 'layout');
  return ACTION_OK;
}
