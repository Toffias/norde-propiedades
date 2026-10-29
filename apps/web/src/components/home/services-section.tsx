import { Building2, ClipboardCheck, House, KeyRound, type LucideIcon } from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';

// Fotos de Unsplash (Licencia Unsplash): iPheGw7_UaI, bqUZEAeWuok, WCiJ4z-iekQ, pMFXOmP5Z1M.
import administracion from '../../assets/services/administracion.jpg';
import alquileres from '../../assets/services/alquileres.jpg';
import compraVenta from '../../assets/services/compra-venta.jpg';
import tasaciones from '../../assets/services/tasaciones.jpg';
import { SectionHeading } from '../layout/section-heading';

interface Service {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  /** De fondo y decorativa: el título y el texto ya dicen de qué se trata. */
  readonly image: StaticImageData;
}

const SERVICES: readonly Service[] = [
  {
    title: 'Compra y venta',
    description: 'Te acompañamos en toda la operación: búsqueda, visitas, negociación y escritura.',
    icon: House,
    image: compraVenta,
  },
  {
    title: 'Alquileres',
    description: 'Departamentos, casas y locales en alquiler, con contratos claros y actualizados.',
    icon: KeyRound,
    image: alquileres,
  },
  {
    title: 'Tasaciones',
    description: 'Conocé el valor real de tu propiedad con una tasación profesional.',
    icon: ClipboardCheck,
    image: tasaciones,
  },
  {
    title: 'Administración de alquileres',
    description: 'Cobranzas, ajustes por índice, mantenimiento y relación con los inquilinos.',
    icon: Building2,
    image: administracion,
  },
];

export function ServicesSection() {
  return (
    <section
      aria-labelledby="services-title"
      id="servicios"
      className="mx-auto max-w-7xl px-4 sm:px-6"
    >
      <SectionHeading
        id="services-title"
        title="Cómo te ayudamos"
        description="Ya sea que quieras mudarte, invertir o poner tu propiedad en el mercado."
      />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map(({ title, description, icon: Icon, image }) => (
          <li
            key={title}
            className="group relative isolate flex min-h-80 flex-col overflow-hidden rounded-3xl bg-black p-6 text-white"
          >
            <Image
              src={image}
              alt=""
              fill
              placeholder="blur"
              sizes="(min-width: 1024px) 20rem, (min-width: 640px) 50vw, 100vw"
              className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
            />
            <span className="mt-auto flex size-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 backdrop-blur-sm">
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-3 text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm text-white/85">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
