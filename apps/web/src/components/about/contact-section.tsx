import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { ArrowRight, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

import { BUSINESS } from '../../constants/business';
import { whatsappHref } from '../../lib/whatsapp';
import { SectionHeading } from '../layout/section-heading';
import { InquiryForm } from '../properties/inquiry-form';
import { PropertyMap } from '../properties/property-map';
import { Reveal } from './reveal';

const CARD = 'bg-card flex min-w-0 flex-col gap-1 rounded-2xl border p-4';
const CARD_LABEL =
  'text-muted-foreground flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase';

function ChannelCard({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <p className={CARD_LABEL}>
        {icon}
        {label}
      </p>
      <div className="font-bold break-words">{children}</div>
    </div>
  );
}

function addressLine(): string | null {
  const { address } = BUSINESS;
  if (!address) return null;
  return [address.streetAddress, address.addressLocality].filter(Boolean).join(', ');
}

/** Link a Google Maps con la dirección (sin `geo` confirmado no se puede ubicar un pin). */
function mapsHref(): string | null {
  const { address } = BUSINESS;
  if (!address?.streetAddress) return null;
  const query = [address.streetAddress, address.addressRegion].join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Contacto: el formulario de consulta y los canales, con WhatsApp en su propia tarjeta. */
export function ContactSection({ formEnabled }: { readonly formEnabled: boolean }) {
  const { email, telephone } = BUSINESS;
  const whatsapp = whatsappHref('Hola, quiero hacer una consulta.');
  const address = addressLine();
  const maps = mapsHref();

  return (
    <section
      id="contacto"
      aria-labelledby="contact-title"
      className="mx-auto max-w-7xl scroll-mt-24 space-y-8 px-4 sm:px-6"
    >
      <SectionHeading
        id="contact-title"
        title="¿Hablamos?"
        description="Escribinos para comprar, vender, alquilar o tasar tu propiedad. Te respondemos a la brevedad."
      />
      {/* Las dos columnas con el mismo alto: la tarjeta de la oficina estira su mapa. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Reveal className="bg-card rounded-3xl border p-5 sm:p-8">
          <h3 className="mb-5 text-xl font-extrabold">Dejanos tu consulta</h3>
          {formEnabled ? (
            <InquiryForm messagePlaceholder="Contanos en qué te podemos ayudar." />
          ) : (
            <p className="text-muted-foreground text-sm">
              Muy pronto vas a poder escribirnos desde acá.
            </p>
          )}
        </Reveal>

        <Reveal delayMs={80} className="flex">
          <address className="flex flex-1 flex-col gap-3 not-italic">
            {(telephone ?? whatsapp) && (
              <div className="grid grid-cols-2 gap-3">
                {telephone && (
                  <ChannelCard icon={<Phone aria-hidden className="size-3.5" />} label="Teléfono">
                    <a href={`tel:${telephone}`} className="hover:text-primary transition-colors">
                      {BUSINESS.telephoneLabel ?? telephone}
                    </a>
                  </ChannelCard>
                )}
                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-whatsapp/30 bg-whatsapp/10 hover:bg-whatsapp/15 flex min-w-0 flex-col gap-1 rounded-2xl border p-4 transition-colors"
                  >
                    <span className="text-whatsapp flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
                      <WhatsAppIcon aria-hidden className="size-3.5" />
                      WhatsApp
                    </span>
                    <span className="text-whatsapp mt-auto inline-flex items-center gap-1 font-bold">
                      Escribinos
                      <ArrowRight aria-hidden className="size-4" />
                    </span>
                  </a>
                )}
              </div>
            )}
            {email && (
              <ChannelCard icon={<Mail aria-hidden className="size-3.5" />} label="Email">
                <a href={`mailto:${email}`} className="hover:text-primary transition-colors">
                  {email}
                </a>
              </ChannelCard>
            )}
            {address && (
              <div className={`${CARD} flex-1`}>
                <p className={CARD_LABEL}>
                  <MapPin aria-hidden className="size-3.5" />
                  Oficina
                </p>
                <p className="font-bold break-words">{address}</p>
                {maps && (
                  <a
                    href={maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary mt-1 inline-flex w-fit items-center gap-1 text-sm font-bold hover:underline"
                  >
                    Cómo llegar
                    <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                )}
                {BUSINESS.geo && (
                  <PropertyMap
                    latitude={BUSINESS.geo.latitude}
                    longitude={BUSINESS.geo.longitude}
                    exact
                    label={`Ubicación de la oficina: ${address}`}
                    className="mt-3 h-48 rounded-xl lg:h-auto lg:min-h-40 lg:flex-1"
                  />
                )}
              </div>
            )}
          </address>
        </Reveal>
      </div>
    </section>
  );
}
