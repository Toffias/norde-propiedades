import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { Mail, MapPin, Phone } from 'lucide-react';

import { BUSINESS } from '../../constants/business';
import { whatsappHref } from '../../lib/whatsapp';

const ITEM = 'flex items-start gap-3';
const ICON = 'text-primary mt-0.5 size-5 shrink-0';
const LINK = 'hover:text-primary font-semibold transition-colors';

/**
 * Los canales de contacto que Norde ya confirmó en `BUSINESS`. Sin ninguno, no se muestra:
 * es preferible omitir un dato a publicarlo equivocado.
 */
export function ContactChannels({ whatsappText }: { readonly whatsappText: string }) {
  const { address, email, telephone } = BUSINESS;
  const whatsapp = whatsappHref(whatsappText);
  if (!whatsapp && !telephone && !email && !address) return null;

  return (
    <aside
      aria-labelledby="contact-channels-title"
      className="bg-card space-y-5 rounded-3xl border p-5 sm:p-6"
    >
      <h2 id="contact-channels-title" className="text-lg font-extrabold">
        Otras formas de contactarnos
      </h2>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-whatsapp flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          <WhatsAppIcon className="size-5" />
          Escribinos por WhatsApp
        </a>
      )}
      <address className="space-y-4 text-sm not-italic">
        {telephone && (
          <p className={ITEM}>
            <Phone aria-hidden className={ICON} />
            <a href={`tel:${telephone}`} className={LINK}>
              {BUSINESS.telephoneLabel ?? telephone}
            </a>
          </p>
        )}
        {email && (
          <p className={ITEM}>
            <Mail aria-hidden className={ICON} />
            <a href={`mailto:${email}`} className={LINK}>
              {email}
            </a>
          </p>
        )}
        {address && (
          <p className={ITEM}>
            <MapPin aria-hidden className={ICON} />
            <span>
              {[address.streetAddress, address.addressLocality, address.addressRegion]
                .filter(Boolean)
                .join(', ')}
            </span>
          </p>
        )}
      </address>
    </aside>
  );
}
