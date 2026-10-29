import { ChartLine, ClipboardCheck, House, MessageSquareText, type LucideIcon } from 'lucide-react';

import { Reveal } from '../about/reveal';
import { TimelineRail } from '../about/timeline-rail';
import { StepNumber } from './step-number';

interface Step {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  {
    title: 'Nos contás de tu propiedad',
    description:
      'Dejanos tus datos y una descripción de la propiedad. Te contactamos para coordinar la visita.',
    icon: MessageSquareText,
  },
  {
    title: 'La visitamos',
    description: 'Vemos la propiedad, su estado, la superficie y lo que la hace única.',
    icon: House,
  },
  {
    title: 'Analizamos el mercado',
    description:
      'Comparamos con propiedades similares de la zona y su valor por metro cuadrado para llegar a un precio realista.',
    icon: ChartLine,
  },
  {
    title: 'Te entregamos el informe',
    description:
      'Un informe con el valor sugerido, las propiedades comparables, nuestras observaciones y las fotos. Y te asesoramos para vender o alquilar.',
    icon: ClipboardCheck,
  },
];

/**
 * Cómo tasamos: el título queda fijo a la izquierda mientras los pasos entran en cascada sobre
 * una línea que se pinta al bajar.
 */
export function AppraisalProcess() {
  return (
    <section
      id="proceso"
      aria-labelledby="process-title"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6"
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal className="space-y-4">
            <p className="text-primary text-sm font-bold tracking-[0.14em] uppercase">El proceso</p>
            <h2 id="process-title" className="text-4xl leading-tight font-extrabold sm:text-5xl">
              Cómo tasamos con Norde
            </h2>
            <div aria-hidden className="deco-steps-sm" />
            <p className="text-muted-foreground text-lg">
              Una tasación bien hecha es el primer paso para vender o alquilar en menos tiempo y sin
              bajas de precio sucesivas.
            </p>
            <a
              href="#pedir-tasacion"
              className="text-primary inline-flex items-center gap-1 text-sm font-bold hover:underline"
            >
              Empezá ahora →
            </a>
          </Reveal>
        </div>

        <div className="relative">
          <div aria-hidden className="bg-border absolute top-2 bottom-2 left-5 w-0.5 sm:left-6">
            <TimelineRail className="absolute inset-0" />
          </div>
          <ol className="space-y-10 sm:space-y-16">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.title} className="relative flex gap-3 sm:gap-8">
                <span className="border-primary bg-background text-primary relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 sm:size-12">
                  <step.icon aria-hidden className="size-5" />
                </span>
                <div className="bg-card min-w-0 flex-1 rounded-3xl border p-5 shadow-sm sm:p-8">
                  <StepNumber value={String(index + 1).padStart(2, '0')} />
                  <h3 className="mt-3 text-xl font-extrabold sm:text-2xl">{step.title}</h3>
                  <p className="text-muted-foreground mt-2">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
