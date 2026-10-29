import { BedDouble, CalendarClock, MapPin, Ruler, Scale, type LucideIcon } from 'lucide-react';

import { Reveal } from '../about/reveal';

interface Factor {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const FACTORS: readonly Factor[] = [
  {
    title: 'Ubicación',
    description: 'El barrio, la cuadra y lo que hay cerca.',
    icon: MapPin,
  },
  {
    title: 'Superficie',
    description: 'Los metros cubiertos y descubiertos.',
    icon: Ruler,
  },
  {
    title: 'Estado y antigüedad',
    description: 'Cómo está hoy y qué mantenimiento tuvo.',
    icon: CalendarClock,
  },
  {
    title: 'Ambientes y amenities',
    description: 'La distribución y lo que suma valor.',
    icon: BedDouble,
  },
  {
    title: 'Comparables',
    description: 'Los precios de propiedades similares de la zona.',
    icon: Scale,
  },
];

/** Qué mira Norde para tasar: tarjetas que entran en cascada. */
export function AppraisalFactors() {
  return (
    <section aria-labelledby="factors-title" className="mx-auto max-w-7xl px-4 sm:px-6">
      <Reveal className="max-w-2xl space-y-3">
        <h2 id="factors-title" className="text-3xl font-extrabold sm:text-4xl">
          Qué tenemos en cuenta
        </h2>
        <div aria-hidden className="deco-steps-sm" />
      </Reveal>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FACTORS.map((factor, index) => (
          <Reveal
            as="li"
            key={factor.title}
            delayMs={index * 90}
            className="bg-card group rounded-3xl border p-5 transition-shadow hover:shadow-md"
          >
            <span className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground grid size-11 place-items-center rounded-xl transition-colors">
              <factor.icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-4 font-extrabold">{factor.title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{factor.description}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
