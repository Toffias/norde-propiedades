'use client';

import { useImageSkeleton } from '@norde/ui/components/image-skeleton';
import { cn } from '@norde/ui/lib/utils';
import Image, { type ImageProps } from 'next/image';

type SkeletonImageProps = Omit<ImageProps, 'priority'> & {
  /** La foto principal de la pantalla: se pide antes que el resto (`priority` de `next/image`). */
  readonly priority?: boolean;
};

/**
 * `next/image` con skeleton de carga: mientras la foto no llega, su lugar late en lugar de quedar
 * vacío. Para fotos de contenido (propiedades, emprendimientos, blog); las estáticas del sitio ya
 * traen su `placeholder="blur"`. Si cambia `src`, va con `key={src}`.
 */
export function SkeletonImage({
  className,
  priority = false,
  onLoad,
  onError,
  ...props
}: SkeletonImageProps) {
  const skeleton = useImageSkeleton();
  return (
    <Image
      {...props}
      priority={priority}
      className={cn(skeleton.className, className)}
      onLoad={(event) => {
        skeleton.done();
        onLoad?.(event);
      }}
      onError={(event) => {
        skeleton.done();
        onError?.(event);
      }}
    />
  );
}
