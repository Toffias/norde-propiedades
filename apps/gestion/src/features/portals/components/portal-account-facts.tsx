import type {
  LinkedListingCountsView,
  ListingOwnerKindValue,
  PortalAccountView,
  PortalPackageView,
  PortalValue,
} from '@norde/core/portals/contracts';
import { cn } from '@norde/ui/lib/utils';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { formatCount, formatDate } from '../../../lib/format';
import { PACKAGE_CONTENT_LABELS, packageTierLabel, planLabel } from '../messages';
import type { PortalCreditsResult, PortalPackagesResult } from '../queries';

// Piezas de solo lectura de una cuenta de portal, compartidas por su tarjeta y su panel lateral.

const LOGOS: Readonly<Record<PortalValue, { src: string; alt: string }>> = {
  mercadolibre: { src: '/portals/mercadolibre.png', alt: 'MercadoLibre' },
  mercadolibre_developments: { src: '/portals/mercadolibre.png', alt: 'MercadoLibre' },
  zonaprop: { src: '/portals/zonaprop.png', alt: 'Zonaprop' },
};

/**
 * El logo del portal. El fondo es blanco en los dos temas: los logos de las marcas están pensados
 * para ir sobre blanco.
 */
export function PortalLogo({
  portal,
  className,
}: {
  readonly portal: PortalValue;
  readonly className?: string;
}) {
  const logo = LOGOS[portal];
  return (
    <div
      className={cn(
        'grid place-items-center rounded-xl border border-border bg-white px-4 py-3',
        className,
      )}
    >
      <Image
        src={logo.src}
        alt={logo.alt}
        width={320}
        height={93}
        className="h-auto max-h-14 w-full max-w-[180px] object-contain"
      />
    </div>
  );
}

/** Un dato de la cuenta: etiqueta arriba, valor grande y un detalle opcional. */
export function Fact({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5', className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-col justify-between gap-1 text-sm">{children}</dd>
    </div>
  );
}

const LINKED_LABELS: Readonly<Record<ListingOwnerKindValue, string>> = {
  property: 'Propiedades vinculadas',
  development: 'Emprendimientos vinculados',
};

function linkedTotal(counts: LinkedListingCountsView): number {
  return counts.published + counts.paused + counts.error;
}

/** "10 publicadas · 2 pausadas", sin los estados en cero. */
function linkedDetail(counts: LinkedListingCountsView): string {
  const parts = [
    counts.published > 0 && formatCount(counts.published, 'publicada', 'publicadas'),
    counts.paused > 0 && formatCount(counts.paused, 'pausada', 'pausadas'),
    counts.error > 0 && formatCount(counts.error, 'con error', 'con error'),
  ].filter((part) => part !== false);
  return parts.length === 0 ? 'Ninguna con aviso en el portal' : parts.join(' · ');
}

/** Cuántas propiedades (o emprendimientos) del sistema tienen aviso en esta cuenta. */
export function LinkedFacts({ account }: { readonly account: PortalAccountView }) {
  return account.publishes.map((kind) => {
    const counts = account.linked[kind];
    return (
      <Fact key={kind} label={LINKED_LABELS[kind]}>
        <span className="text-3xl leading-none font-bold tabular-nums">{linkedTotal(counts)}</span>
        <span className="text-xs text-muted-foreground">{linkedDetail(counts)}</span>
      </Fact>
    );
  });
}

/** Lo contratado en el portal: los créditos por plan (Zonaprop) o los paquetes (MercadoLibre). */
export function PlanFacts({
  credits,
  packages,
}: {
  readonly credits: PortalCreditsResult | undefined;
  readonly packages: PortalPackagesResult | undefined;
}) {
  if (credits !== undefined) {
    return (
      <Fact label="Créditos disponibles">
        {!credits.ok ? (
          <span className="text-muted-foreground">{credits.message}</span>
        ) : credits.credits.length === 0 ? (
          <span className="text-muted-foreground">La cuenta no tiene créditos de publicación.</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {credits.credits.map((credit) => (
              <li key={credit.plan} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-muted-foreground">
                  {planLabel(credit.plan)}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {credit.available}
                  {credit.contracted !== undefined && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      de {credit.contracted}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Fact>
    );
  }
  if (packages === undefined) return null;
  if (!packages.ok || packages.packages.length === 0) {
    return (
      <Fact label="Paquete">
        <span className="text-muted-foreground">
          {packages.ok
            ? 'La cuenta no tiene paquetes activos: MercadoLibre no deja publicar inmuebles sin un paquete.'
            : packages.message}
        </span>
      </Fact>
    );
  }
  return packages.packages.map((pack) => <PackageFact key={pack.id} pack={pack} />);
}

function PackageFact({ pack }: { readonly pack: PortalPackageView }) {
  return (
    <Fact label={`Paquete · ${PACKAGE_CONTENT_LABELS[pack.content]}`}>
      <span className="truncate font-semibold">{pack.name}</span>
      {pack.quotas.length === 0 ? (
        <span className="text-muted-foreground">Sin límite de avisos.</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {pack.quotas.map((quota) => (
            <li key={quota.tier} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">
                {packageTierLabel(quota.tier)}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {quota.remaining}
                <span className="font-normal text-muted-foreground"> libres de {quota.total}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {pack.expiresAt !== undefined && (
        <span className="text-xs text-muted-foreground">Vence el {formatDate(pack.expiresAt)}</span>
      )}
    </Fact>
  );
}
