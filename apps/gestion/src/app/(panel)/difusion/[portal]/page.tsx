import { PORTAL_VALUES, type PortalValue } from '@norde/core/portals/contracts';
import { ListPortalPublicationsQuerySchema } from '@norde/core/reporting/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ErrorState } from '@norde/ui/components/error-state';
import { PageHeader } from '@norde/ui/components/page-header';
import { cn } from '@norde/ui/lib/utils';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PortalMark } from '../../../../features/portals/components/portal-account-facts';
import { PORTAL_LABELS } from '../../../../features/portals/messages';
import { PortalCounters } from '../../../../features/publications/components/portal-counters';
import { PortalPublicationsGrid } from '../../../../features/publications/components/portal-publications-grid';
import { BUCKET_LABELS, OWNER_KIND_LABELS } from '../../../../features/publications/labels';
import { portalPath } from '../../../../features/publications/paths';
import {
  loadPortalPublications,
  loadPublicationOverview,
} from '../../../../features/publications/queries';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';

export const metadata: Metadata = { title: 'Difusión' };

function portalFrom(value: string): PortalValue | undefined {
  return PORTAL_VALUES.find((portal) => portal === value);
}

/**
 * Difusión de un portal (#114): sus contadores y el listado del elegido (`?kind=property&bucket=`),
 * paginado en el servidor.
 */
export default async function PortalPublicationsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly portal: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const [{ portal: raw }, query] = await Promise.all([params, searchParams]);
  const portal = portalFrom(raw);
  if (portal === undefined) notFound();

  const loaded = await loadPublicationOverview();
  if (loaded.kind === 'hidden') notFound();
  if (loaded.kind === 'error') {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }
  const overview = loaded.overview.portals.find((p) => p.portal === portal);
  // Un portal apagado no tiene pantalla: se prende en Mi empresa → Portales.
  if (overview === undefined) notFound();

  const requestedKind = Array.isArray(query.kind) ? query.kind[0] : query.kind;
  const current = overview.kinds.find((k) => k.kind === requestedKind) ?? overview.kinds[0];
  if (current === undefined) notFound();
  const { value: input, invalidKeys } = parseListParams(ListPortalPublicationsQuerySchema, {
    ...query,
    portal,
    kind: current.kind,
  });
  const { bucket } = input;
  const publications = await loadPortalPublications(input);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/difusion"
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden />
        Difusión
      </Link>
      <PageHeader
        leading={<PortalMark portal={portal} />}
        title={PORTAL_LABELS[portal]}
        subtitle="Las publicaciones de la cuenta: tocá un contador para ver su listado"
      />

      {overview.kinds.length > 1 && (
        <nav aria-label="Qué publicaciones ver" className="-mx-1 overflow-x-auto px-1">
          <ul className="inline-flex gap-1 rounded-xl bg-muted p-1">
            {overview.kinds.map(({ kind }) => (
              <li key={kind}>
                <Link
                  href={portalPath(portal, kind, bucket)}
                  aria-current={kind === current.kind ? 'page' : undefined}
                  scroll={false}
                  className={cn(
                    'inline-flex rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                    kind === current.kind && 'bg-background text-foreground shadow-sm dark:bg-card',
                  )}
                >
                  {OWNER_KIND_LABELS[kind]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <PortalCounters portal={portal} kind={current.kind} counts={current.counts} active={bucket} />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-bold">{BUCKET_LABELS[bucket].label}</h2>
          <p className="text-sm text-muted-foreground">{BUCKET_LABELS[bucket].hint}</p>
        </div>
        {publications.kind === 'ok' ? (
          <PortalPublicationsGrid
            portal={portal}
            bucket={bucket}
            page={publications.page}
            sort={input.sort}
          />
        ) : (
          <DataTableError
            message={
              publications.kind === 'error'
                ? publications.message
                : 'La difusión en portales no está activada.'
            }
          />
        )}
      </Card>
    </div>
  );
}
