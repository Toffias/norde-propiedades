import { ListRemoteListingsInputSchema } from '@norde/core/portals/contracts';
import { SectionCard } from '@norde/ui/components/section-card';
import { cn } from '@norde/ui/lib/utils';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RemoteDevelopmentsGrid } from '../../../../../features/portals/components/remote-developments-grid';
import { RemoteListingsGrid } from '../../../../../features/portals/components/remote-listings-grid';
import {
  loadRemoteDevelopments,
  loadRemoteListings,
} from '../../../../../features/portals/queries';
import { FormAlert } from '../../../../../features/shared/components/form-alert';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';

export const metadata: Metadata = { title: 'Avisos en Zonaprop' };

const PATH = '/mi-empresa/portales/avisos';

/** Avisos sueltos o emprendimientos: la vista va en la URL (`?ver=emprendimientos`). */
const VIEWS = [
  { id: 'avisos', label: 'Avisos' },
  { id: 'emprendimientos', label: 'Emprendimientos' },
] as const;
type View = (typeof VIEWS)[number]['id'];

function viewFrom(params: SearchParams): View {
  const value = Array.isArray(params.ver) ? params.ver[0] : params.ver;
  return value === 'emprendimientos' ? 'emprendimientos' : 'avisos';
}

/**
 * Los avisos y los emprendimientos que Norde tiene online en Zonaprop, para vincular los que
 * publicó Tokko.
 */
export default async function RemoteListingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = viewFrom(params);
  const { value } = parseListParams(ListRemoteListingsInputSchema, {
    ...params,
    portal: 'zonaprop',
  });
  const loaded =
    view === 'emprendimientos'
      ? { view, result: await loadRemoteDevelopments(value) }
      : { view, result: await loadRemoteListings(value) };
  if (loaded.result.kind === 'hidden') notFound();

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
          <nav aria-label="Qué avisos ver" className="-mx-1 overflow-x-auto px-1">
            <ul className="inline-flex gap-1 rounded-xl bg-muted p-1">
              {VIEWS.map((option) => (
                <li key={option.id}>
                  <Link
                    // La misma página con otra vista: typedRoutes no verifica un string armado.
                    href={(option.id === 'avisos' ? PATH : `${PATH}?ver=${option.id}`) as Route}
                    aria-current={option.id === view ? 'page' : undefined}
                    scroll={false}
                    className={cn(
                      'inline-flex rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                      option.id === view && 'bg-background text-foreground shadow-sm dark:bg-card',
                    )}
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-sm text-muted-foreground">
            {view === 'emprendimientos'
              ? 'Los emprendimientos que la inmobiliaria tiene online en Zonaprop, publicados por Tokko. Cada uno se empareja con el emprendimiento que tiene su clave interna como código, y cada unidad con la unidad del mismo código. Vincular no republica el aviso: conserva su antigüedad, sus visitas y sus consultas, y queda como está hasta que cambie algo del emprendimiento o de sus unidades en el sistema.'
              : 'Los avisos que la inmobiliaria tiene online en Zonaprop, publicados por Tokko. Cada uno se empareja con la propiedad que tiene su clave interna como código de referencia. Vincular no republica el aviso: conserva su antigüedad, sus visitas y sus consultas, y queda como está hasta que cambie algo de la propiedad en el sistema.'}
          </p>
          {loaded.result.kind === 'error' ? (
            <FormAlert message={loaded.result.message} />
          ) : loaded.view === 'emprendimientos' ? (
            <RemoteDevelopmentsGrid portal="zonaprop" page={loaded.result.page} />
          ) : (
            <RemoteListingsGrid portal="zonaprop" page={loaded.result.page} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
