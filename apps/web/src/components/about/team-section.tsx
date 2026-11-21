import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { UserRound } from 'lucide-react';

import type { TeamMemberCard } from '../../lib/about/about-content';
import { whatsappHref } from '../../lib/whatsapp';
import { MediaImage } from '../blog/media-image';
import { SectionHeading } from '../layout/section-heading';
import { Reveal } from './reveal';

/** Con menos, una vuelta de la cinta no llena una pantalla ancha y se ve el corte: se repiten. */
const MIN_ITEMS = 8;
/** Segundos que tarda en pasar cada tarjeta: la velocidad es la misma con más o menos personas. */
const SECONDS_PER_CARD = 7;

function MemberCard({ member, copy }: { readonly member: TeamMemberCard; readonly copy: boolean }) {
  const whatsapp = member.whatsapp
    ? whatsappHref(`Hola ${member.name}, quiero hacer una consulta.`, member.whatsapp)
    : null;

  return (
    <article className="group bg-background flex h-full flex-col overflow-hidden rounded-3xl border transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="bg-muted relative aspect-[4/5] overflow-hidden">
        {member.photo ? (
          <MediaImage
            media={member.photo}
            sizes="(min-width: 640px) 18rem, 15rem"
            className="size-full transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : (
          <div className="text-muted-foreground/50 grid size-full place-items-center">
            <UserRound aria-hidden className="size-1/3" strokeWidth={1.25} />
          </div>
        )}
        {member.area && (
          <span className="bg-primary text-primary-foreground absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold">
            {member.area}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="leading-snug font-bold">{member.name}</h3>
        <p className="text-muted-foreground text-sm">{member.role}</p>
        {member.license && <p className="text-muted-foreground text-xs">{member.license}</p>}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={copy ? -1 : undefined}
            className="text-whatsapp mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-sm font-bold link-underline"
          >
            <WhatsAppIcon aria-hidden className="size-4" />
            Escribile
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * El equipo de Norde: una tarjeta con foto por persona, en una cinta a todo el ancho que desfila
 * sin parar, como la de barrios de la home. La lista va dos veces para que la vuelta no se note; la
 * copia queda fuera del lector de pantalla y del Tab. Se frena con el mouse encima (para poder
 * tocar "Escribile") o con el foco del teclado; con "reducir movimiento" queda quieta y se recorre
 * con scroll horizontal.
 */
export function TeamSection({ members }: { readonly members: readonly TeamMemberCard[] }) {
  if (members.length === 0) return null;

  const repeats = Math.ceil(MIN_ITEMS / members.length);
  const items = Array.from({ length: repeats }, (_, round) =>
    members.map((member) => ({ member, key: `${String(round)}-${member.id}` })),
  ).flat();

  const list = (copy: boolean) => (
    <ul aria-hidden={copy || undefined} className="team-ribbon-list flex shrink-0">
      {items.map(({ member, key }) => (
        <li key={key} className="w-60 shrink-0 pr-3 sm:w-72 sm:pr-4">
          <MemberCard member={member} copy={copy} />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="team-title" className="bg-card space-y-8 border-y py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          id="team-title"
          title="Nuestro equipo"
          accent="especializado"
          description="Cada uno se especializa en una parte del trabajo. Escribile directo a quien te corresponda o pasá por la oficina."
        />
      </div>
      <Reveal>
        <div className="team-ribbon overflow-hidden py-2">
          <div
            className="team-ribbon-track flex w-max"
            style={{ animationDuration: `${String(items.length * SECONDS_PER_CARD)}s` }}
          >
            {list(false)}
            {list(true)}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
