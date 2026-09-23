import { Button } from '@norde/ui/components/button';
import type { Metadata } from 'next';
import Link from 'next/link';

import { routes } from '../../lib/seo/routes';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <p className="text-muted-foreground text-sm font-medium">Error 404</p>
      <h1 className="text-3xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="text-muted-foreground">
        Puede que la dirección esté mal escrita o que el contenido ya no esté disponible.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={routes.home()}>Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.blog()}>Ver el blog</Link>
        </Button>
      </div>
    </div>
  );
}
