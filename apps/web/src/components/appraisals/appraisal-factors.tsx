import { BedDouble, CalendarClock, MapPin, Ruler, Scale, type LucideIcon } from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';

// Fotos de Unsplash (Licencia Unsplash): vDPPsccEvhE, cfNchb3VAI8, 9gCRnfwSkwo, S5VtKjf4tcM,
// pvjY_tXDkXA.
import ambientes from '../../assets/appraisal-factors/ambientes.jpg';
import comparables from '../../assets/appraisal-factors/comparables.jpg';
import estado from '../../assets/appraisal-factors/estado.jpg';
import superficie from '../../assets/appraisal-factors/superficie.jpg';
import ubicacion from '../../assets/appraisal-factors/ubicacion.jpg';
import { Reveal } from '../about/reveal';

interface Factor {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  /** De fondo y decorativa: el título y el texto ya dicen de qué se trata. */
  readonly image: StaticImageData;
}

const FACTORS: readonly Factor[] = [
  {
    title: 'Ubicación',
    description: 'El barrio, la cuadra y lo que hay cerca.',
    icon: MapPin,
    image: ubicacion,
  },
  {
    title: 'Superficie',
    description: 'Los metros cubiertos y descubiertos.',
    icon: Ruler,
    image: superficie,
  },
  {
    title: 'Estado y antigüedad',
    description: 'Cómo está hoy y qué mantenimiento tuvo.',
    icon: CalendarClock,
    image: estado,
  },
  {
    title: 'Ambientes y amenities',
    description: 'La distribución y lo que suma valor.',
    icon: BedDouble,
    image: ambientes,
  },
  {
    title: 'Comparables',
    description: 'Los precios de propiedades similares de la zona.',
    icon: Scale,
    image: comparables,
  },
];

/** Qué mira Norde para tasar: tarjetas con foto de fondo que entran en cascada. */
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
            className="group relative isolate flex min-h-80 flex-col overflow-hidden rounded-3xl bg-black p-5 text-white"
          >
            <Image
              src={factor.image}
              alt=""
              fill
              placeholder="blur"
              sizes="(min-width: 1024px) 16rem, (min-width: 640px) 50vw, 100vw"
              className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
            />
            <span className="mt-auto flex size-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 backdrop-blur-sm">
              <factor.icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-3 text-lg font-bold">{factor.title}</h3>
            <p className="mt-1 text-sm text-white/85">{factor.description}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
