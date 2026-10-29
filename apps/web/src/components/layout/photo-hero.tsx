import { cn } from '@norde/ui/lib/utils';
import Image, { type StaticImageData } from 'next/image';
import type { ReactNode } from 'react';

import { Parallax } from '../about/parallax';

/**
 * Portada a pantalla completa (debajo del header transparente, ver `HeaderShell`): la foto en
 * parallax. Los hijos son el contenido, sobre la foto.
 */
export function PhotoHero({
  image,
  alt,
  imageClassName,
  labelledBy,
  className,
  children,
}: {
  readonly image: StaticImageData;
  readonly alt: string;
  /** Por ejemplo, `object-[center_40%]` para elegir el recorte. */
  readonly imageClassName?: string;
  readonly labelledBy: string;
  /** Para el contenedor del contenido (alineación, padding). */
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        'relative isolate flex min-h-[calc(100svh-2.5rem)] flex-col overflow-hidden bg-black',
        className,
      )}
    >
      <Parallax speed={0.25} className="absolute inset-x-0 -inset-y-[20%] -z-10">
        <Image
          src={image}
          alt={alt}
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className={cn('object-cover', imageClassName)}
        />
      </Parallax>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/65 via-black/25 to-black/80"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black/50 via-black/10 to-transparent"
      />
      {children}
    </section>
  );
}
