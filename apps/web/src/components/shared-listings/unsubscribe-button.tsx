'use client';

import { Button } from '@norde/ui/components/button';
import { useState, useTransition } from 'react';

import { unsubscribeFromFollowUps } from '../../lib/shared-listings/actions';

const FAILED: Readonly<Record<'invalid' | 'rate_limited' | 'unavailable', string>> = {
  invalid: 'No pudimos darte de baja. Probá de nuevo.',
  rate_limited: 'Recibimos muchos pedidos seguidos. Probá de nuevo en unos minutos.',
  unavailable: 'No encontramos este link. Escribinos y te damos de baja nosotros.',
};

/**
 * Confirma la baja de los seguimientos automáticos. Pide un clic a propósito: los lectores de
 * correo abren los links para revisarlos, y eso solo no tiene que dar de baja a nadie.
 */
export function UnsubscribeButton({ token }: { readonly token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="font-semibold">
        Listo, no te vamos a mandar más estos emails.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const outcome = await unsubscribeFromFollowUps({ token }).catch(() => ({
              ok: false as const,
              reason: 'invalid' as const,
            }));
            if (outcome.ok) setDone(true);
            else setError(FAILED[outcome.reason]);
          });
        }}
      >
        {pending ? 'Dando de baja…' : 'Darme de baja'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
