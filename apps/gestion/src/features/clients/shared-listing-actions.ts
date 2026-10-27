'use server';

import {
  RevokeSharedListingInputSchema,
  SendListingsInputSchema,
  type RevokeSharedListingInput,
  type SendListingsInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { REVOKE_SHARED_LISTING_ERROR_MESSAGES, SEND_LISTINGS_ERROR_MESSAGES } from './messages';

// Envíos de propiedades a un contacto por email o WhatsApp (#104).

function contactPath(clientId: string): string {
  return `/contactos/${clientId}`;
}

export async function sendListingsAction(
  input: SendListingsInput,
): Promise<ActionResult & { readonly whatsappUrl?: string }> {
  const { actor } = await requireSession();
  const parsed = SendListingsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(SEND_LISTINGS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.sendListings.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, SEND_LISTINGS_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  const { whatsappUrl } = result.value;
  return whatsappUrl === undefined ? ACTION_OK : { ...ACTION_OK, whatsappUrl };
}

export async function revokeSharedListingAction(
  input: RevokeSharedListingInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RevokeSharedListingInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REVOKE_SHARED_LISTING_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.revokeSharedListing.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REVOKE_SHARED_LISTING_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}
