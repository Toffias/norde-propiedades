import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, UploadIcon } from 'lucide-react';
import Link from 'next/link';

/** Encabezado del historial de importaciones de contactos. */
export function ClientImportsHeader() {
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
        icon={UploadIcon}
        title="Importar contactos"
        subtitle="Contactos desde un Excel, con el historial de cada importación"
      />
    </>
  );
}
