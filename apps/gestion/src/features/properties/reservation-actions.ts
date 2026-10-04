'use server';

import {
  FallReservationInputSchema,
  ReservePropertyInputSchema,
  SignReservationInputSchema,
  UpdateReservationInputSchema,
  type FallReservationInput,
  type ReservePropertyInput,
  type SignReservationInput,
  type UpdateReservationInput,
} from '@norde/core/properties/contracts';
import type { Result } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { RESERVATION_ERROR_MESSAGES } from './reservation-messages';

// Server Actions de las reservas (#13): una por caso de uso.

const INVALID = RESERVATION_ERROR_MESSAGES.InvalidInput;

function properties() {
  return getContainer().properties;
}

/**
 * Mapea el resultado y revalida las fichas de propiedades (el estado cambia con la reserva) y la del
 * contacto, si se reservó desde sus destacadas.
 */
function done<E extends { readonly type: keyof typeof RESERVATION_ERROR_MESSAGES }>(
  result: Result<unknown, E>,
  clientId?: string,
): ActionResult {
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, RESERVATION_ERROR_MESSAGES));
  }
  revalidatePath('/propiedades', 'layout');
  if (clientId !== undefined) revalidatePath(`/contactos/${clientId}`);
  return ACTION_OK;
}

export async function reservePropertyAction(input: ReservePropertyInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReservePropertyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().reserveProperty.execute(parsed.data, actor);
  return done(result, parsed.data.clientId);
}

export async function updateReservationAction(
  input: UpdateReservationInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateReservationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updateReservation.execute(parsed.data, actor);
  return done(result);
}

export async function fallReservationAction(input: FallReservationInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FallReservationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().fallReservation.execute(parsed.data, actor);
  return done(result);
}

export async function signReservationAction(input: SignReservationInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SignReservationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().signReservation.execute(parsed.data, actor);
  return done(result);
}
