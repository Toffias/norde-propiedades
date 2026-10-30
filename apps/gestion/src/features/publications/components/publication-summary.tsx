import type { ListingOwnerKindValue } from '@norde/core/portals/contracts';
import type { PublicationOverview } from '@norde/core/reporting/contracts';
import Link from 'next/link';

import { PortalMark } from '../../portals/components/portal-account-facts';
import { PORTAL_LABELS } from '../../portals/messages';
import { OWNER_KIND_LABELS } from '../labels';
import { portalPath } from '../paths';

const KINDS: readonly ListingOwnerKindValue[] = ['property', 'development'];

/**
 * Resumen de Difusión: lo disponible, cuánto está en la web y cuánto en cada portal prendido. Un
 * portal que no publica ese tipo de aviso queda con guion.
 */
export function PublicationSummary({ overview }: { readonly overview: PublicationOverview }) {
  const availability = { property: overview.properties, development: overview.developments };
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">Publicaciones por tipo, en la web y en cada portal</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-semibold">
              Tipo
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Disponibles
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              En la web
            </th>
            {overview.portals.map(({ portal }) => (
              <th key={portal} scope="col" className="px-3 py-2 text-right font-semibold">
                <span className="inline-flex flex-col items-end gap-1">
                  <PortalMark portal={portal} />
                  {PORTAL_LABELS[portal]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KINDS.map((kind) => (
            <tr key={kind} className="border-b border-border last:border-0">
              <th scope="row" className="py-3 pr-4 text-left font-medium">
                {OWNER_KIND_LABELS[kind]}
              </th>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">
                {availability[kind].available}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{availability[kind].onWeb}</td>
              {overview.portals.map(({ portal, kinds }) => {
                const own = kinds.find((k) => k.kind === kind);
                return (
                  <td key={portal} className="px-3 py-3 text-right tabular-nums">
                    {own === undefined ? (
                      <span className="text-muted-foreground" aria-label="No publica">
                        —
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <Link
                          href={portalPath(portal, kind, 'published')}
                          className="font-medium hover:underline"
                        >
                          {own.publishedOwners}
                        </Link>
                        {own.counts.missing > 0 && (
                          <Link
                            href={portalPath(portal, kind, 'missing')}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {own.counts.missing} sin publicar
                          </Link>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
