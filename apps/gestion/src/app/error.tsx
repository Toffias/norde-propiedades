'use client';

import { Button } from '@norde/ui/components/button';
import { ErrorState } from '@norde/ui/components/error-state';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

// Un error del servidor (con `digest`) ya se logueó y se reportó en `instrumentation.ts`; uno del
// navegador se reporta acá (ADR 0049). La página informa, con el código que permite encontrar el log.
export default function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    if (error.digest === undefined) Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorState
      {...(error.digest === undefined
        ? {}
        : {
            description: `No pudimos cargar esta pantalla. Probá de nuevo en unos segundos. Código: ${error.digest}`,
          })}
      actions={
        <>
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Ir al inicio</Link>
          </Button>
        </>
      }
    />
  );
}
