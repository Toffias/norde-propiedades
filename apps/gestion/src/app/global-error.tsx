'use client';

import './globals.css';

import { Button } from '@norde/ui/components/button';
import { ErrorState } from '@norde/ui/components/error-state';

// Falla el layout raíz: no hay providers ni fuentes, así que la página se arma sola. El error ya
// se logueó en el servidor (`instrumentation.ts`); acá solo se informa, con el código para soporte.
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
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
