import { Button } from '@norde/ui/components/button';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, TagsIcon } from 'lucide-react';
import Link from 'next/link';

/** Encabezado de las etiquetas de contactos, con las pestañas Etiquetas y Grupos (cada una su ruta). */
export function ClientTagsHeader({ active }: { readonly active: 'tags' | 'groups' }) {
  return (
    <>
      <Link
        href="/contactos"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a contactos
      </Link>
      <PageHeader
        icon={TagsIcon}
        title="Etiquetas de contactos"
        subtitle="Grupos y etiquetas para ordenar y filtrar la agenda"
      />
      <nav aria-label="Etiquetas de contactos" className="flex gap-2">
        <Button asChild size="sm" variant={active === 'tags' ? 'default' : 'outline'}>
          <Link href="/contactos/etiquetas" aria-current={active === 'tags' ? 'page' : undefined}>
            Etiquetas
          </Link>
        </Button>
        <Button asChild size="sm" variant={active === 'groups' ? 'default' : 'outline'}>
          <Link
            href="/contactos/etiquetas/grupos"
            aria-current={active === 'groups' ? 'page' : undefined}
          >
            Grupos
          </Link>
        </Button>
      </nav>
    </>
  );
}
