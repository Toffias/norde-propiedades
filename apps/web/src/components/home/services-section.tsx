import { Building2, ClipboardCheck, House, KeyRound, type LucideIcon } from 'lucide-react';

import { SectionHeading } from '../layout/section-heading';

interface Service {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const SERVICES: readonly Service[] = [
  {
    title: 'Compra y venta',
    description: 'Te acompañamos en toda la operación: búsqueda, visitas, negociación y escritura.',
    icon: House,
  },
  {
    title: 'Alquileres',
    description: 'Departamentos, casas y locales en alquiler, con contratos claros y actualizados.',
    icon: KeyRound,
  },
  {
    title: 'Tasaciones',
    description: 'Conocé el valor real de tu propiedad con una tasación profesional.',
    icon: ClipboardCheck,
  },
  {
    title: 'Administración de alquileres',
    description: 'Cobranzas, ajustes por índice, mantenimiento y relación con los inquilinos.',
    icon: Building2,
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
        {SERVICES.map(({ title, description, icon: Icon }) => (
          <li key={title} className="bg-card text-card-foreground rounded-3xl border p-6">
            <span className="bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 flex size-11 items-center justify-center rounded-2xl">
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-4 font-bold">{title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
