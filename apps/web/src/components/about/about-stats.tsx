import { cn } from '@norde/ui/lib/utils';
import {
  Award,
  BriefcaseBusiness,
  Handshake,
  House,
  MapPin,
  MessagesSquare,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';

import facade from '../../assets/fachada-norde.jpg';
import type { AboutStat } from '../../lib/about/about-content';
import { guessStatIcon, type AboutStatIcon } from '../../lib/about/stat-icons';
import { CountUp } from './count-up';
import { Reveal } from './reveal';

const COLUMNS: Readonly<Record<number, string>> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

const ICONS: Readonly<Record<AboutStatIcon, LucideIcon>> = {
  years: Award,
  properties: House,
  deals: Handshake,
  inquiries: MessagesSquare,
  locations: MapPin,
  services: BriefcaseBusiness,
  team: Users,
};

/** Las cifras de Norde sobre una banda oscura con la fachada: cuentan al aparecer en pantalla. */
export function AboutStats({ stats }: { readonly stats: readonly AboutStat[] }) {
  if (stats.length === 0) return null;

  return (
    <section aria-label="Norde en números" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-3xl bg-black px-6 py-8 text-white sm:px-10 sm:py-10">
        <Image
          src={facade}
          alt=""
          fill
          placeholder="blur"
          sizes="(min-width: 1152px) 72rem, 100vw"
          className="-z-10 object-cover object-[center_45%]"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/70" />
        <dl className={cn('grid gap-8', COLUMNS[stats.length])}>
          {stats.map((stat, index) => {
            // Se deduce acá y no al leer: el contenido cacheado de antes no trae el ícono.
            const icon = stat.icon ?? guessStatIcon(stat.label);
            const Icon = icon ? ICONS[icon] : TrendingUp;
            return (
              <Reveal key={stat.id} delayMs={index * 80} className="flex items-center gap-4">
                <Icon aria-hidden strokeWidth={1.5} className="size-11 shrink-0 text-white" />
                <div className="flex min-w-0 flex-col-reverse gap-1">
                  <dt className="text-sm text-white/80">{stat.label}</dt>
                  <dd className="text-3xl leading-none font-extrabold sm:text-4xl">
                    <CountUp stat={stat} />
                  </dd>
                </div>
              </Reveal>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
