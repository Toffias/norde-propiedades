import { ListRemoteListingsInputSchema } from '@norde/core/portals/contracts';
import { SectionCard } from '@norde/ui/components/section-card';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RemoteListingsGrid } from '../../../../../features/portals/components/remote-listings-grid';
import { loadRemoteListings } from '../../../../../features/portals/queries';
import { FormAlert } from '../../../../../features/shared/components/form-alert';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';

export const metadata: Metadata = { title: 'Avisos en Zonaprop' };

/** Los avisos que Norde tiene online en Zonaprop, para vincular los que publicó Tokko. */
export default async function RemoteListingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { value } = parseListParams(ListRemoteListingsInputSchema, {
    ...(await searchParams),
    portal: 'zonaprop',
  });
  const loaded = await loadRemoteListings(value);
  if (loaded.kind === 'hidden') notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/mi-empresa/portales"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden />
        Portales
      </Link>
      <SectionCard title="Avisos en Zonaprop">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Los avisos que la inmobiliaria tiene online en Zonaprop, publicados por Tokko. Cada uno
            se empareja con la propiedad que tiene su clave interna como código de referencia.
            Vincular no republica el aviso: conserva su antigüedad, sus visitas y sus consultas, y
            queda como está hasta que cambie algo de la propiedad en el sistema.
          </p>
          {loaded.kind === 'error' ? (
            <FormAlert message={loaded.message} />
          ) : (
            <RemoteListingsGrid portal="zonaprop" page={loaded.page} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
