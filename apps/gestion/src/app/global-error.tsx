'use client';

import './globals.css';

import { Button } from '@norde/ui/components/button';
import { ErrorState } from '@norde/ui/components/error-state';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Falla el layout raíz: no hay providers ni fuentes, así que la página se arma sola. Un error del
// servidor (con `digest`) ya se logueó y se reportó en `instrumentation.ts`; uno del navegador se
// reporta acá (ADR 0049). La página informa, con el código para soporte.
export default function GlobalError({
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
    <html lang="es-AR">
      <body className="bg-background text-foreground antialiased">
        <ErrorState
          description={
            error.digest === undefined
              ? 'No pudimos cargar el panel. Probá de nuevo en unos segundos.'
              : `No pudimos cargar el panel. Probá de nuevo en unos segundos. Código: ${error.digest}`
          }
          actions={
            <Button type="button" onClick={reset}>
              Reintentar
            </Button>
          }
        />
      </body>
    </html>
  );
}
