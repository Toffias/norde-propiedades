import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { UserRound } from 'lucide-react';

import type { TeamMemberCard } from '../../lib/about/about-content';
import { whatsappHref } from '../../lib/whatsapp';
import { MediaImage } from '../blog/media-image';
import { SectionHeading } from '../layout/section-heading';
import { Reveal } from './reveal';

function MemberCard({ member }: { readonly member: TeamMemberCard }) {
  const whatsapp = member.whatsapp
    ? whatsappHref(`Hola ${member.name}, quiero hacer una consulta.`, member.whatsapp)
    : null;

  return (
    <article className="group bg-background flex h-full flex-col overflow-hidden rounded-3xl border transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="bg-muted relative aspect-[4/5] overflow-hidden">
        {member.photo ? (
          <MediaImage
            media={member.photo}
            sizes="(min-width: 1024px) 18rem, 50vw"
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
            className="text-whatsapp mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-sm font-bold hover:underline"
          >
            <WhatsAppIcon aria-hidden className="size-4" />
            Escribile
          </a>
        )}
      </div>
    </article>
  );
}

/** El equipo de Norde: una tarjeta con foto por persona. */
export function TeamSection({ members }: { readonly members: readonly TeamMemberCard[] }) {
  if (members.length === 0) return null;

  return (
    <section aria-labelledby="team-title" className="bg-card border-y">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-14 sm:px-6 sm:py-16">
        <SectionHeading
          id="team-title"
          title="Las personas que te van a atender"
          description="Cada uno se especializa en una parte del trabajo. Escribile directo a quien te corresponda o pasá por la oficina."
        />
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {members.map((member, index) => (
            <Reveal as="li" key={member.id} delayMs={(index % 4) * 80}>
              <MemberCard member={member} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
