import { cn } from '@norde/ui/lib/utils';
import Image from 'next/image';
import type { CSSProperties } from 'react';

import { BUSINESS } from '../../constants/business';
import { getCompanyLogo, type CompanyLogo as CompanyLogoData } from '../../lib/brand/company-logo';
import { getLogoSizes } from '../../lib/brand/logo-size-query';
import type { LogoSizes } from '../../lib/brand/logo-size';
import { routes } from '../../lib/seo/routes';
import { NordeLogo } from './norde-logo';

/** El alto del logo cargado, según dónde va: lo elige Norde en Payload ("Apariencia"). */
function heightStyle(
  placement: 'header' | 'footer',
  sizes: LogoSizes,
): CSSProperties & Record<`--${string}`, string> {
  if (placement === 'footer') return { height: sizes.footer };
  // Variables CSS: el alto cambia con el ancho de la pantalla y un `style` no tiene media queries.
  return {
    '--logo-h': `${sizes.header.mobile}px`,
    '--logo-h-sm': `${sizes.header.desktop}px`,
  };
}

function LogoImage({
  logo,
  variant,
  placement,
  sizes,
  className,
}: {
  readonly logo: CompanyLogoData;
  readonly variant: 'light' | 'dark';
  readonly placement: 'header' | 'footer';
  readonly sizes: LogoSizes;
  readonly className?: string;
}) {
  return (
    <Image
      src={routes.companyLogo(logo.version, variant)}
      alt={BUSINESS.name}
      // Solo indican la proporción para reservar el lugar: el tamaño real lo da `style`.
      width={240}
      height={80}
      unoptimized
      priority
      style={heightStyle(placement, sizes)}
      className={cn(
        'w-auto object-contain',
        placement === 'header' && 'h-(--logo-h) sm:h-(--logo-h-sm)',
        className,
      )}
    />
  );
}

/**
 * El logo de Norde: el que cargaron en el panel (Mi empresa) o, si no hay, el dibujado con texto.
 * Si cargaron también uno para fondos oscuros, ese reemplaza al común en el tema oscuro. Se muestra
 * siempre con sus colores, también sobre la foto de una portada.
 */
export async function CompanyLogo({
  placement,
  fallbackClassName,
}: {
  /** Dónde va: define el alto de la imagen (el ancho sigue la proporción del logo). */
  readonly placement: 'header' | 'footer';
  /** Para el logo de texto, cuando no hay uno cargado. */
  readonly fallbackClassName?: string;
}) {
  const [light, dark, sizes] = await Promise.all([
    getCompanyLogo('light'),
    getCompanyLogo('dark'),
    getLogoSizes(),
  ]);
  // Con logo oscuro, el común (o el de texto) se oculta en el tema oscuro y el oscuro aparece.
  const lightOnly = dark === null ? undefined : 'dark:hidden';

  return (
    <>
      {light === null ? (
        <NordeLogo className={cn(fallbackClassName, lightOnly)} />
      ) : (
        <LogoImage
          logo={light}
          variant="light"
          placement={placement}
          sizes={sizes}
          {...(lightOnly ? { className: lightOnly } : {})}
        />
      )}
      {dark !== null && (
        <LogoImage
          logo={dark}
          variant="dark"
          placement={placement}
          sizes={sizes}
          className="hidden dark:block"
        />
      )}
    </>
  );
}
