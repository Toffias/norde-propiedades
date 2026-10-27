'use client';

import { useEffect, useRef } from 'react';

import { openSharedListing } from '../../lib/shared-listings/actions';

/**
 * Registra la apertura del envío desde el navegador, una vez por visita. Las vistas previas de
 * WhatsApp o del correo no corren JavaScript: no cuentan como apertura.
 */
export function OpenBeacon({ token }: { readonly token: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    // Si no se registra, el cliente igual ve las propiedades: no hay nada que mostrarle.
    void openSharedListing({ token }).catch(() => undefined);
  }, [token]);
  return null;
}
