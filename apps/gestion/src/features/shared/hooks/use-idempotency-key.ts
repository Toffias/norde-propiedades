'use client';

import { useCallback, useState } from 'react';

/**
 * UUID v4 con `crypto.getRandomValues`, que existe también fuera de HTTPS (`randomUUID` no).
 */
export function newIdempotencyKey(
  random: (values: Uint8Array) => Uint8Array = (values) => crypto.getRandomValues(values),
): string {
  const bytes = random(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Clave de idempotencia de un formulario de alta (ADR 0050). Se manda con la acción y es la misma
 * en cada reintento: un doble clic o un "Reintentar" después de un error de red no repiten el alta.
 * Después de un alta que salió bien, `renew` la cambia para la próxima.
 */
export function useIdempotencyKey(): { readonly key: string; readonly renew: () => void } {
  const [key, setKey] = useState(() => newIdempotencyKey());
  const renew = useCallback(() => {
    setKey(newIdempotencyKey());
  }, []);
  return { key, renew };
}
