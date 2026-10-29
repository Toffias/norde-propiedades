import { Button } from '@norde/ui/components/button';
import { MessageCircle } from 'lucide-react';
import Image from 'next/image';

import keys from '../../assets/services/alquileres.jpg';

import { BUSINESS } from '../../constants/business';

const WHATSAPP_TEXT = 'Hola, quiero vender o alquilar mi propiedad.';

/** Llamado a la acción para propietarios. El botón aparece cuando hay un canal de contacto. */
export function OwnersCta() {
  const whatsappHref = BUSINESS.whatsapp
    ? `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(WHATSAPP_TEXT)}`
    : null;
  const emailHref = BUSINESS.email ? `mailto:${BUSINESS.email}` : null;

  return (
    <section aria-labelledby="owners-cta-title" className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Sobre una foto oscurecida: el texto va en blanco en los dos temas. */}
      <div className="relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-[28px] bg-black px-6 py-12 text-white sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <Image
          src={keys}
          alt=""
          fill
          placeholder="blur"
          sizes="(min-width: 1280px) 80rem, 100vw"
          className="-z-10 object-cover object-[center_40%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/65 to-black/40"
        />
        <div className="max-w-xl space-y-2">
          <h2 id="owners-cta-title" className="text-2xl font-extrabold sm:text-3xl">
            ¿Querés vender o alquilar tu propiedad?
          </h2>
          <p className="text-white/80">
            Te ayudamos a definir el precio, la publicamos en los principales portales y coordinamos
            las visitas por vos.
          </p>
        </div>
        {whatsappHref && (
          <Button asChild variant="secondary" size="lg">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden />
              Escribinos por WhatsApp
            </a>
          </Button>
        )}
        {!whatsappHref && emailHref && (
          <Button asChild variant="secondary" size="lg">
            <a href={emailHref}>Escribinos</a>
          </Button>
        )}
      </div>
    </section>
  );
}
