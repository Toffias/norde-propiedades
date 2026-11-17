import { ArrowUpRight } from 'lucide-react';

import { BUSINESS } from '../../constants/business';
import { GoogleIcon } from './google-icon';

/** "Dejanos tu reseña": abre la ficha de Norde en Google Maps. Sin ficha, no se muestra. */
export function LeaveReviewLink({ className }: { readonly className?: string }) {
  if (!BUSINESS.googleMapsUrl) return null;

  return (
    <a
      href={BUSINESS.googleMapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex w-fit items-center gap-1.5 ${className ?? ''}`}
    >
      <GoogleIcon aria-hidden className="size-4 shrink-0" />
      Dejanos tu reseña
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}
