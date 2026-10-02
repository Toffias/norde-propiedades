import type { DomainEvent } from '../../shared/domain/domain-event';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Client } from './client';
import { normalizeName } from './duplicate-check';

// Supresión de datos de un cliente (Ley 25.326): se borra físicamente todo lo suyo, en todos los
// módulos, y queda una constancia sin datos personales.

/** Lo que hay que escribir para confirmar un contacto sin nombre. */
export const ERASURE_CONFIRMATION_WORD = 'suprimir';

/** Tope de duplicados unificados que se suprimen junto con un contacto. */
export const MAX_ERASED_MERGED_CLIENTS = 100;

export interface ErasureNotConfirmedError {
  readonly type: 'ErasureNotConfirmed';
}

/** La fecha del pedido es posterior a hoy. */
export interface ErasureRequestInFutureError {
  readonly type: 'ErasureRequestInFuture';
}

/** Constancia de una supresión: fecha del pedido, quién la ejecutó y el ID suprimido. */
export interface ErasureRecord {
  readonly id: string;
  readonly erasedEntityType: 'client';
  readonly erasedEntityId: string;
  readonly requestedAt: Date;
  readonly executedBy: string;
  readonly executedAt: Date;
}

/**
 * Se suprimieron los datos de un cliente: `erasedClientIds` son él y los duplicados que se le
 * unificaron (sus lápidas guardan nombre y datos de la ficha). Cada módulo borra lo suyo.
 */
export type ClientErased = DomainEvent<
  'clients.client_erased',
  { readonly clientId: string; readonly erasedClientIds: readonly string[] }
>;

/**
 * La segunda confirmación: escribir el nombre del contacto (sin importar mayúsculas, acentos ni
 * espacios), o `suprimir` si no tiene nombre.
 */
export function confirmsErasure(client: Client, typed: string): boolean {
  const expected = normalizeName(client.name ?? '') || ERASURE_CONFIRMATION_WORD;
  return normalizeName(typed) === expected;
}

/** Los clientes que se suprimen: el pedido y sus duplicados unificados, sin repetir. */
export function clientsToErase(client: Client, mergedIntoIt: readonly string[]): string[] {
  return [...new Set([client.id, ...mergedIntoIt])];
}

export function clientErased(
  clientId: string,
  erasedClientIds: readonly string[],
  now: Date,
): ClientErased {
  return {
    type: 'clients.client_erased',
    aggregateId: clientId,
    occurredAt: now,
    payload: { clientId, erasedClientIds },
  };
}

/** La constancia. El pedido no puede ser posterior a la ejecución. */
export function erasureRecord(input: {
  readonly id: string;
  readonly clientId: string;
  readonly requestedAt: Date;
  readonly executedBy: string;
  readonly now: Date;
}): Result<ErasureRecord, ErasureRequestInFutureError> {
  if (input.requestedAt > input.now) return err({ type: 'ErasureRequestInFuture' });
  return ok({
    id: input.id,
    erasedEntityType: 'client',
    erasedEntityId: input.clientId,
    requestedAt: input.requestedAt,
    executedBy: input.executedBy,
    executedAt: input.now,
  });
}
