'use client';

import { Button } from '@norde/ui/components/button';
import { ErrorState } from '@norde/ui/components/error-state';
import Link from 'next/link';

// Los errores inesperados se loguean del lado del servidor (en el borde); acá solo se informa.
export default function RouteError({
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <ErrorState
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
