import type { Metadata } from 'next';

import { Reveal } from '../../../components/about/reveal';
import { AppraisalFactors } from '../../../components/appraisals/appraisal-factors';
import { AppraisalHero } from '../../../components/appraisals/appraisal-hero';
import { AppraisalProcess } from '../../../components/appraisals/appraisal-process';
import { FaqSection } from '../../../components/blog/faq-section';
import { ContactChannels } from '../../../components/layout/contact-channels';
import { InquiryForm } from '../../../components/properties/inquiry-form';
import { JsonLdScript } from '../../../components/seo/json-ld-script';
import { getContainer } from '../../../container';
import { breadcrumbSchema, serviceSchema, type FaqEntry } from '../../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';
import { getSiteUrl } from '../../../lib/site-url';

// Por request: el formulario depende de la configuración del entorno (el build corre sin ella).
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Pedí la tasación de tu casa, departamento, PH o local: te decimos su valor de mercado según la zona, el estado y las operaciones comparables.';

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
    <div className="pb-8">
      <JsonLdScript
        data={serviceSchema(getSiteUrl(), {
          name: 'Tasación de propiedades',
          description: DESCRIPTION,
          path: routes.appraisals(),
          serviceType: 'Tasación inmobiliaria',
        })}
      />
      {/* Sin migas visibles: la portada ocupa la pantalla. Quedan para los buscadores. */}
      <JsonLdScript
        data={breadcrumbSchema(getSiteUrl(), [
          { name: 'Inicio', path: routes.home() },
          { name: 'Tasaciones', path: routes.appraisals() },
        ])}
      />
      <AppraisalHero description={DESCRIPTION} />

      <div className="mt-20 space-y-24 sm:mt-28 sm:space-y-32">
        <AppraisalProcess />
        <AppraisalFactors />

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FaqSection entries={FAQ} />
        </div>

        <section
          id="pedir-tasacion"
          aria-labelledby="appraisal-form-title"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6"
        >
          <div className="bg-card grid gap-10 rounded-[28px] border p-6 shadow-sm sm:p-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16 lg:p-14">
            <Reveal className="space-y-6">
              <p className="text-primary text-sm font-bold tracking-[0.14em] uppercase">
                Tasá tu propiedad
              </p>
              <h2
                id="appraisal-form-title"
                className="text-4xl leading-tight font-extrabold sm:text-5xl"
              >
                Pedí tu tasación
              </h2>
              <div aria-hidden className="deco-steps-sm" />
              <p className="text-muted-foreground text-lg">
                Dejanos tus datos y contanos de tu propiedad: dónde está, qué tipo es y si la querés
                vender o alquilar.
              </p>
              <ContactChannels whatsappText="Hola, quiero tasar mi propiedad." />
            </Reveal>

            {/* Se estira al alto de la columna izquierda: el textarea crece y el botón queda al ras. */}
            <Reveal className="flex flex-col border-t pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16">
              <h3 className="mb-5 text-xl font-extrabold">Tus datos</h3>
              {formEnabled ? (
                // Hasta que exista el alta de tasaciones desde la web, entra como consulta: el
                // saludo inicial es lo que le dice a la bandeja que es una tasación.
                <InquiryForm
                  defaultMessage="Hola, quiero tasar mi propiedad. "
                  messagePlaceholder="Dónde está, qué tipo de propiedad es, ambientes, metros y si la querés vender o alquilar."
                  messageLabel="Descripción de la propiedad"
                  submitLabel="Pedir tasación"
                  fill
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Muy pronto vas a poder pedirla desde acá.
                </p>
              )}
            </Reveal>
          </div>
        </section>
      </div>
    </div>
  );
}
