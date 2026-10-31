import { BedDouble, DoorOpen, ExternalLink, House, Ruler, type LucideIcon } from 'lucide-react';

import { SkeletonImage } from '../layout/skeleton-image';
import type { ChatPropertyCard as ChatPropertyCardData } from '../../lib/chat/chat-contract';
import { internalPath } from '../../lib/chat/markdown';
import { formatSurface } from '../../lib/properties/format';

interface Fact {
  readonly icon: LucideIcon;
  readonly label: string;
}

function facts(card: ChatPropertyCardData): Fact[] {
  return [
    card.rooms !== null && { icon: DoorOpen, label: `${card.rooms} amb.` },
    card.bedrooms !== null &&
      card.bedrooms > 0 && { icon: BedDouble, label: `${card.bedrooms} dorm.` },
    card.surfaceM2 !== null && { icon: Ruler, label: formatSurface(card.surfaceM2) },
  ].filter((fact): fact is Fact => fact !== false);
}

/**
 * Tarjeta chica de una propiedad que nombró el agente: portada, operación y precio, nombre,
 * ubicación, datos básicos y un botón que abre la ficha en otra pestaña (el chat sigue abierto).
 */
export function ChatPropertyCard({
  card,
  siteUrl,
}: {
  readonly card: ChatPropertyCardData;
  readonly siteUrl: string;
}) {
  // Las fichas y las fotos del propio sitio van por ruta relativa: sirven en cualquier dominio.
  const href = internalPath(card.url, siteUrl) ?? card.url;
  const photoPath = card.photoUrl ? internalPath(card.photoUrl, siteUrl) : undefined;
  const photoSrc = photoPath ?? card.photoUrl;

  return (
    <article className="bg-card flex gap-3 rounded-2xl border p-2 shadow-xs">
      <div className="bg-muted relative size-24 shrink-0 overflow-hidden rounded-xl">
        {photoSrc ? (
          <SkeletonImage
            src={photoSrc}
            alt={`Foto de ${card.title}`}
            fill
            sizes="96px"
            unoptimized={photoPath === undefined}
            className="object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <House aria-hidden className="size-7" />
          </div>
        )}
        <span className="bg-brand-600 absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white">
          {card.operation}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-0.5 pr-1">
        <p className="text-[15px] leading-tight font-extrabold tracking-tight">{card.price}</p>
        <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-semibold">{card.title}</h3>
        {card.location && (
          <p className="text-muted-foreground line-clamp-1 text-xs">{card.location}</p>
        )}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 pt-1.5">
          <ul className="text-muted-foreground flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
            {facts(card).map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1">
                <Icon aria-hidden className="size-3" />
                {label}
              </li>
            ))}
          </ul>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap outline-none hover:opacity-90 focus-visible:ring-[3px]"
          >
            Ver propiedad
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only"> {card.title} (se abre en otra pestaña)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
