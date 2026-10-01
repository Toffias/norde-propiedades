import { Button } from '@norde/ui/components/button';
import { PublicLayout } from '@norde/ui/components/public-layout';
import { LogInIcon } from 'lucide-react';
import Link from 'next/link';

import { getNodeEnv } from '../config/env';

export default function HomePage() {
  const isDevelopment = getNodeEnv() === 'development';

  return (
    <PublicLayout>
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LogInIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h1 className="font-body text-base font-semibold">Ingresar</h1>
          </div>
          <p className="text-sm leading-normal text-muted-foreground">
            Panel interno en construcción. El ingreso se habilita con el módulo de usuarios.
          </p>
        </header>
        <Button disabled>Ingresar</Button>
        {isDevelopment && (
          <Button variant="link" asChild className="self-center">
            <Link href="/dev/design-system">Ver el design system</Link>
          </Button>
        )}
      </section>
    </PublicLayout>
  );
}
