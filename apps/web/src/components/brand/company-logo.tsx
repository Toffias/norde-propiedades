import { cn } from '@norde/ui/lib/utils';
import Image from 'next/image';

import { BUSINESS } from '../../constants/business';
import { getCompanyLogo } from '../../lib/brand/company-logo';
import { routes } from '../../lib/seo/routes';
import { NordeLogo } from './norde-logo';

/**
 * El logo de Norde: el que cargaron en el panel (Mi empresa) o, si no hay, el dibujado con texto.
 * Sobre la foto de una portada y en el tema oscuro se pinta de blanco para que se lea.
 */
export async function CompanyLogo({
  className,
  fallbackClassName,
}: {
  /** Para la imagen: el alto (el ancho sigue la proporción del logo). */
  readonly className?: string;
  /** Para el logo de texto, cuando no hay uno cargado. */
  readonly fallbackClassName?: string;
}) {
  const logo = await getCompanyLogo();
  if (logo === null)
    return <NordeLogo {...(fallbackClassName ? { className: fallbackClassName } : {})} />;

  return (
    <Image
      src={routes.companyLogo(logo.version)}
      alt={BUSINESS.name}
      // Solo indican la proporción para reservar el lugar: el tamaño real lo da `className`.
      width={240}
      height={80}
      unoptimized
      priority
      className={cn(
        'w-auto object-contain',
        'group-data-[overlay=true]/header:brightness-0 group-data-[overlay=true]/header:invert',
        'dark:brightness-0 dark:invert',
        className,
      )}
    />
  );
}
