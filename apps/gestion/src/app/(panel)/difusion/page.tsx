import { ErrorState } from '@norde/ui/components/error-state';
import { PageHeader } from '@norde/ui/components/page-header';
import { SectionCard } from '@norde/ui/components/section-card';
import { ArrowRightIcon, MegaphoneIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PortalMark } from '../../../features/portals/components/portal-account-facts';
import { PORTAL_LABELS } from '../../../features/portals/messages';
import { PortalCounters } from '../../../features/publications/components/portal-counters';
import { PublicationSummary } from '../../../features/publications/components/publication-summary';
import { OWNER_KIND_LABELS } from '../../../features/publications/labels';
import { portalPath } from '../../../features/publications/paths';
import { loadPublicationOverview } from '../../../features/publications/queries';

export const metadata: Metadata = { title: 'Difusión' };

/** Difusión (#114): el resumen de lo publicado y los contadores de cada portal prendido. */
export default async function PublicationsPage() {
  const loaded = await loadPublicationOverview();
  if (loaded.kind === 'hidden') {
    return (
      <ErrorState
        title="La difusión en portales no está activada"
        description="Pedile a un administrador que la active en el servidor."
      />
    );
  }
  if (loaded.kind === 'error') {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }
  const { overview } = loaded;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={MegaphoneIcon}
        title="Difusión"
        subtitle="Qué está publicado en la web y en cada portal"
      />

      <PublicationSummary overview={overview} />

      {overview.portals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay portales prendidos. Se conectan y se prenden en{' '}
          <Link href="/mi-empresa/portales" className="font-medium text-primary hover:underline">
            Mi empresa → Portales
          </Link>
          .
        </p>
      ) : (
        overview.portals.map(({ portal, kinds }) => (
          <SectionCard
            key={portal}
            title={PORTAL_LABELS[portal]}
            leading={<PortalMark portal={portal} />}
            action={
              kinds[0] && (
                <Link
                  href={portalPath(portal, kinds[0].kind)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Ver publicaciones
                  <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </Link>
              )
            }
          >
            <div className="flex flex-col gap-4">
              {kinds.map(({ kind, counts }) => (
                <div key={kind} className="flex flex-col gap-2">
                  {kinds.length > 1 && (
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {OWNER_KIND_LABELS[kind]}
                    </h3>
                  )}
                  <PortalCounters portal={portal} kind={kind} counts={counts} />
                </div>
              ))}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
