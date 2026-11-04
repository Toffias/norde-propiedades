'use server';

import { z } from 'zod';

import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { clientIp } from '../client-ip';
import { createRateLimiter } from '../rate-limit';

/** Por IP cada 10 minutos: alcanza para confirmar y reintentar, no para probar tokens. */
const allow = createRateLimiter(10, () => Date.now());

const InputSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export type ConfirmOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'expired' | 'not_found' | 'rate_limited' | 'failed' };

/**
 * Confirma la suscripción a una búsqueda desde la página del link del email (#208). Pide un clic:
 * los lectores de correo abren los links para revisarlos, y eso solo no confirma nada.
 */
export async function confirmSearchSubscription(input: unknown): Promise<ConfirmOutcome> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'not_found' };
  if (!allow(await clientIp())) return { ok: false, reason: 'rate_limited' };
  const result = await getContainer().searchSubscriptions.confirm(parsed.data);
  if (result.isOk()) return { ok: true };
  const { error } = result;
  if (error.type === 'SearchSubscriptionExpired') return { ok: false, reason: 'expired' };
  if (error.type === 'SearchSubscriptionNotFound') return { ok: false, reason: 'not_found' };
  // Tope de búsquedas, contacto sin datos o el actor mal configurado: lo resuelve el equipo.
  getLogger()
    .child({ component: 'search-subscription-confirm' })
    .error({ error: error.type }, 'Search subscription not confirmed');
  return { ok: false, reason: 'failed' };
}
