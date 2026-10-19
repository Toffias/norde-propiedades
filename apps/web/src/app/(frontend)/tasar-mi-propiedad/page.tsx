import { ClipboardCheck, House, MessageSquareText, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { FaqSection } from '../../../components/blog/faq-section';
import { ContactChannels } from '../../../components/layout/contact-channels';
import { InquiryForm } from '../../../components/properties/inquiry-form';
import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import { JsonLdScript } from '../../../components/seo/json-ld-script';
import { getContainer } from '../../../container';
import { serviceSchema, type FaqEntry } from '../../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';
import { getSiteUrl } from '../../../lib/site-url';

// Por request: el formulario depende de la configuración del entorno (el build corre sin ella).
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Pedí la tasación de tu casa, departamento, PH o local: te decimos su valor de mercado según la zona, el estado y las operaciones comparables.';

interface Step {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  {
    title: 'Nos contás de tu propiedad',
    description: 'Dejanos tus datos y dónde está la propiedad. Te contactamos para coordinar.',
    icon: MessageSquareText,
  },
  {
    title: 'La visitamos',
    description: 'Vemos la propiedad, su estado, la superficie y lo que la hace única.',
    icon: House,
  },
  {
    title: 'Te damos el valor',
    description:
      'Te explicamos el valor de mercado con propiedades comparables de la zona y te asesoramos para vender o alquilar.',
    icon: ClipboardCheck,
  },
];

const FAQ: readonly FaqEntry[] = [
  {
    question: '¿Para qué sirve tasar mi propiedad?',
    answer:
      'Para publicarla a un precio realista: una propiedad bien tasada se vende o se alquila en menos tiempo y sin bajas de precio sucesivas.',
  },
  {
    question: '¿Qué tienen en cuenta para tasar?',
    answer:
      'La ubicación, la superficie cubierta y descubierta, el estado y la antigüedad, los ambientes y las amenities, y los precios de propiedades comparables de la zona.',
  },
  {
    question: '¿Qué conviene tener a mano?',
    answer:
      'La escritura o el boleto, los planos si los tenés y los últimos comprobantes de expensas e impuestos. Nos ayudan a confirmar las medidas y la situación de la propiedad.',
  },
];

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: withBrand('Tasaciones de propiedades'),
    description: DESCRIPTION,
    path: routes.appraisals(),
  });
}

export default function AppraisalPage() {
  const formEnabled = getContainer().inquiries !== undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <JsonLdScript
        data={serviceSchema(getSiteUrl(), {
          name: 'Tasación de propiedades',
          description: DESCRIPTION,
          path: routes.appraisals(),
          serviceType: 'Tasación inmobiliaria',
        })}
      />
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Tasaciones', path: routes.appraisals() },
        ]}
      />
      <div className="mt-4 max-w-2xl space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Tasá tu propiedad</h1>
        <div aria-hidden className="deco-steps-sm" />
        <p className="text-muted-foreground">{DESCRIPTION}</p>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <section aria-labelledby="steps-title">
            <h2 id="steps-title" className="text-2xl font-extrabold">
              Cómo trabajamos
            </h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="bg-card rounded-3xl border p-5">
                  <step.icon aria-hidden className="text-primary size-7" />
                  <p className="text-muted-foreground mt-4 text-xs font-bold">Paso {index + 1}</p>
                  <h3 className="mt-1 font-extrabold">{step.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>
          <FaqSection entries={FAQ} />
        </div>

        <div className="space-y-6 lg:sticky lg:top-28">
          <section
            id="pedir-tasacion"
            aria-labelledby="appraisal-form-title"
            className="bg-card rounded-3xl border p-5 sm:p-6"
          >
            <h2 id="appraisal-form-title" className="mb-5 text-xl font-extrabold">
              Pedí tu tasación
            </h2>
            {formEnabled ? (
              // Hasta que exista el alta de tasaciones desde la web, entra como consulta.
              <InquiryForm
                defaultMessage="Hola, quiero tasar mi propiedad."
                messagePlaceholder="Contanos dónde está, qué tipo de propiedad es y si la querés vender o alquilar."
                messageLabel="Tu propiedad"
                submitLabel="Pedir tasación"
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Muy pronto vas a poder pedirla desde acá.
              </p>
            )}
          </section>
          <ContactChannels whatsappText="Hola, quiero tasar mi propiedad." />
        </div>
      </div>
    </div>
  );
}
