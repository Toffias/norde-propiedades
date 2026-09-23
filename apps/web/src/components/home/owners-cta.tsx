import { Button } from '@norde/ui/components/button';
import { MessageCircle } from 'lucide-react';

import { BUSINESS } from '../../constants/business';

const WHATSAPP_TEXT = 'Hola, quiero vender o alquilar mi propiedad.';

/** Llamado a la acción para propietarios. El botón aparece cuando hay un canal de contacto. */
export function OwnersCta() {
  const whatsappHref = BUSINESS.whatsapp
    ? `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(WHATSAPP_TEXT)}`
    : null;
  const emailHref = BUSINESS.email ? `mailto:${BUSINESS.email}` : null;

  return (
    <section aria-labelledby="owners-cta-title" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="bg-primary text-primary-foreground flex flex-col items-start gap-6 rounded-2xl px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="max-w-xl space-y-2">
          <h2 id="owners-cta-title" className="text-2xl font-semibold tracking-tight">
            ¿Querés vender o alquilar tu propiedad?
          </h2>
          <p className="text-primary-foreground/80">
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
