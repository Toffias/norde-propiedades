import { Building2, ClipboardCheck, House, KeyRound, type LucideIcon } from 'lucide-react';

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
      className="mx-auto max-w-6xl px-4 sm:px-6"
    >
      <div className="max-w-2xl space-y-2">
        <h2 id="services-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Cómo te ayudamos
        </h2>
        <p className="text-muted-foreground">
          Ya sea que quieras mudarte, invertir o poner tu propiedad en el mercado.
        </p>
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map(({ title, description, icon: Icon }) => (
          <li key={title} className="bg-card text-card-foreground rounded-xl border p-6">
            <Icon aria-hidden className="text-primary size-6" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
