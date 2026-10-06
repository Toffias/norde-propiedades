import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';

import { whatsappHref } from '../../lib/whatsapp';

/** Botón flotante de WhatsApp, en todas las páginas. Sin número confirmado no se muestra. */
export function WhatsAppFloat() {
  const href = whatsappHref('Hola, quiero hacer una consulta.');
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      className="bg-whatsapp fixed right-4 bottom-4 z-(--z-float) flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 sm:right-6 sm:bottom-6"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
