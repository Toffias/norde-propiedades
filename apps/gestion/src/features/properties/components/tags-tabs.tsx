import { Button } from '@norde/ui/components/button';
import Link from 'next/link';

/** Etiquetas o grupos: cada uno es su propia ruta (se puede compartir y volver atrás). */
export function TagsTabs({ active }: { readonly active: 'tags' | 'groups' }) {
  return (
    <nav aria-label="Etiquetas de propiedades" className="flex gap-2">
      <Button asChild size="sm" variant={active === 'tags' ? 'default' : 'outline'}>
        <Link href="/mi-empresa/etiquetas" aria-current={active === 'tags' ? 'page' : undefined}>
          Etiquetas
        </Link>
      </Button>
      <Button asChild size="sm" variant={active === 'groups' ? 'default' : 'outline'}>
        <Link
          href="/mi-empresa/etiquetas/grupos"
          aria-current={active === 'groups' ? 'page' : undefined}
        >
          Grupos
        </Link>
      </Button>
    </nav>
  );
}
