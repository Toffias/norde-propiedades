'use client';

import { Button } from '@norde/ui/components/button';
import { ErrorState } from '@norde/ui/components/error-state';
import Link from 'next/link';

// Los errores inesperados se loguean del lado del servidor (`instrumentation.ts`); acá solo se
// informa, con el código (`digest`) que permite encontrar el log.
export default function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
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
