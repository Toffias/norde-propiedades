import type { Metadata } from 'next';

import { ContactChannels } from '../../../components/layout/contact-channels';
import { InquiryForm } from '../../../components/properties/inquiry-form';
import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import { getContainer } from '../../../container';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';

// Por request: el formulario depende de la configuración del entorno (el build corre sin ella).
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Escribinos para comprar, vender, alquilar o tasar tu propiedad. Te respondemos a la brevedad.';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: withBrand('Contacto'),
    description: DESCRIPTION,
    path: routes.contact(),
  });
}

export default function ContactPage() {
  const formEnabled = getContainer().inquiries !== undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Contacto', path: routes.contact() },
        ]}
      />
      <div className="mt-4 max-w-2xl space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Contacto</h1>
        <div aria-hidden className="deco-steps-sm" />
        <p className="text-muted-foreground">{DESCRIPTION}</p>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="contact-form-title"
          className="bg-card max-w-3xl rounded-3xl border p-5 sm:p-8"
        >
          <h2 id="contact-form-title" className="mb-5 text-xl font-extrabold">
            Dejanos tu consulta
          </h2>
          {formEnabled ? (
            <InquiryForm messagePlaceholder="Contanos en qué te podemos ayudar." />
          ) : (
            <p className="text-muted-foreground text-sm">
              Muy pronto vas a poder escribirnos desde acá.
            </p>
          )}
        </section>
        <ContactChannels whatsappText="Hola, quiero hacer una consulta." />
      </div>
    </div>
  );
}
