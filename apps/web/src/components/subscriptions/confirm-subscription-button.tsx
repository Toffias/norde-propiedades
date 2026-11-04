'use client';

import { Button } from '@norde/ui/components/button';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { confirmSearchSubscription } from '../../lib/subscriptions/confirm-subscription';

const FAILED: Readonly<Record<'expired' | 'not_found' | 'rate_limited' | 'failed', string>> = {
  expired: 'El link venció. Volvé a suscribirte desde el listado de propiedades.',
  not_found: 'No encontramos este link. Volvé a suscribirte desde el listado de propiedades.',
  rate_limited: 'Recibimos muchos pedidos seguidos. Probá de nuevo en unos minutos.',
  failed: 'No pudimos confirmar tu suscripción. Escribinos y la activamos nosotros.',
};

/** Confirma la suscripción con un clic a propósito (los lectores de correo abren los links). */
export function ConfirmSubscriptionButton({ token }: { readonly token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p className="font-semibold">¡Listo! Ya estás suscripto a esta búsqueda.</p>
        <p className="text-muted-foreground text-sm">
          Te vamos a escribir cuando aparezca algo para vos. Cada email trae un link para darte de
          baja cuando quieras.
        </p>
        <Button asChild variant="outline">
          <Link href="/propiedades">Seguir mirando propiedades</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        size="lg"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const outcome = await confirmSearchSubscription({ token }).catch(() => ({
              ok: false as const,
              reason: 'failed' as const,
            }));
            if (outcome.ok) setDone(true);
            else setError(FAILED[outcome.reason]);
          });
        }}
      >
        {pending ? 'Confirmando…' : 'Confirmar suscripción'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
