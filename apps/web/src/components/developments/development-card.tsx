import { Building2, CalendarDays, Camera, KeyRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { DevelopmentCard as DevelopmentCardData } from '../../lib/developments/view';
import { isExternal } from '../../lib/properties/images';

interface DevelopmentCardProps {
  readonly development: DevelopmentCardData;
  /** Las primeras tarjetas de la página cargan su foto con prioridad (LCP). */
  readonly priority?: boolean;
  /** `h2` en el listado, `h3` dentro de una sección con su propio título. */
  readonly headingLevel?: 'h2' | 'h3';
}

/** Tarjeta de un emprendimiento: foto, estado de obra, "desde", ubicación, entrega y unidades. */
export function DevelopmentCard({
  development,
  priority = false,
  headingLevel = 'h3',
}: DevelopmentCardProps) {
  const Heading = headingLevel;

  return (
    <article className="group bg-card hover:border-brand-200 dark:hover:border-brand-800 relative flex w-full flex-col overflow-hidden rounded-3xl border transition-colors">
      <div className="bg-muted relative m-2 aspect-[4/3] overflow-hidden rounded-2xl">
        {development.cover ? (
          <Image
            src={development.cover.src}
            alt={development.cover.alt}
            fill
            sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
            priority={priority}
            unoptimized={isExternal(development.cover.src)}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <Building2 aria-hidden className="size-10" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {development.constructionLabel && (
            <span className="bg-brand-600 rounded-lg px-2.5 py-1 text-xs font-bold text-white">
              {development.constructionLabel}
            </span>
          )}
          {development.typeLabel && (
            <span className="bg-card/90 text-foreground rounded-lg px-2.5 py-1 text-xs font-bold">
              {development.typeLabel}
            </span>
          )}
        </div>
        {development.photoCount > 1 && (
          <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white">
            <Camera aria-hidden className="size-3.5" />
            {development.photoCount}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pt-2 pb-5">
        <p
          className={
            development.priceFromLabel
              ? 'text-xl font-extrabold tracking-tight'
              : 'text-muted-foreground text-lg font-bold'
          }
        >
          {development.priceFromLabel ?? 'Consultar precios'}
        </p>
        <Heading className="mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          {/* El link cubre toda la tarjeta: un solo destino, accesible por el título. */}
          <Link href={development.href} className="after:absolute after:inset-0">
            {development.name}
          </Link>
        </Heading>
        <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
          {development.address
            ? `${development.address} · ${development.location}`
            : development.location}
        </p>
        <ul className="text-muted-foreground mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed pt-3 text-[13px]">
          <li className="flex items-center gap-1.5">
            <KeyRound aria-hidden className="size-3.5" />
            {development.unitsLabel}
          </li>
          {development.deliveryLabel && (
            <li className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-3.5" />
              {development.deliveryLabel}
            </li>
          )}
        </ul>
      </div>
    </article>
  );
}

/** Grilla responsive de tarjetas de emprendimientos. */
export function DevelopmentGrid({
  developments,
  headingLevel,
  priorityCount = 0,
}: {
  readonly developments: readonly DevelopmentCardData[];
  readonly headingLevel?: 'h2' | 'h3';
  readonly priorityCount?: number;
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {developments.map((development, index) => (
        <li key={development.id} className="flex">
          <DevelopmentCard
            development={development}
            priority={index < priorityCount}
            {...(headingLevel && { headingLevel })}
          />
        </li>
      ))}
    </ul>
  );
}
