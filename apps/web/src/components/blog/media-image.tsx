import { cn } from '@norde/ui/lib/utils';
import Image from 'next/image';

import { toSitePath } from '../../lib/seo/routes';
import { getSiteUrl } from '../../lib/site-url';
import type { Media } from '../../payload-types';

interface MediaImageProps {
  readonly media: Media;
  /** Atributo `sizes` de la imagen responsiva. */
  readonly sizes: string;
  readonly className?: string;
  readonly priority?: boolean;
}

/** Imagen de la colección `media` optimizada con next/image (el alt es obligatorio en el admin). */
export function MediaImage({ media, sizes, className, priority = false }: MediaImageProps) {
  if (!media.url || !media.width || !media.height) return null;

  const hasFocalPoint = typeof media.focalX === 'number' && typeof media.focalY === 'number';

  return (
    <Image
      // Payload devuelve URLs absolutas; las del propio sitio pasan por `images.localPatterns`.
      src={toSitePath(media.url, getSiteUrl())}
      alt={media.alt}
      width={media.width}
      height={media.height}
      sizes={sizes}
      priority={priority}
      className={cn('object-cover', className)}
      style={hasFocalPoint ? { objectPosition: `${media.focalX}% ${media.focalY}%` } : undefined}
    />
  );
}
