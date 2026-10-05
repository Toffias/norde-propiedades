'use client';

import type { PropertyCover } from '@norde/core/properties/contracts';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type CoverOwner = 'property' | 'development';

const OWNER_PATHS: Readonly<Record<CoverOwner, string>> = {
  property: '/propiedades',
  development: '/emprendimientos',
};

/** La miniatura de la portada, por la ruta del panel (el storage es privado). */
export function propertyCoverUrl(
  propertyId: string,
  cover: PropertyCover,
  owner: CoverOwner = 'property',
): string {
  const ready = cover.hasThumbnail ? 'ready' : 'pending';
  return `${OWNER_PATHS[owner]}/${propertyId}/fotos/${cover.mediaId}?v=thumbnail&r=${ready}`;
}

/**
 * La portada de una propiedad (o de un emprendimiento, con `owner`), o `fallback` si no tiene
 * fotos o la foto no carga.
 */
export function PropertyPhoto({
  propertyId,
  owner = 'property',
  cover,
  className,
  fallback,
}: {
  readonly propertyId: string;
  readonly owner?: CoverOwner;
  readonly cover: PropertyCover | undefined;
  readonly className: string;
  readonly fallback: ReactNode;
}) {
  if (cover === undefined) return fallback;
  const src = propertyCoverUrl(propertyId, cover, owner);
  // Con otra foto (o con la miniatura ya lista) se vuelve a intentar desde cero.
  return <FallbackImage key={src} src={src} className={className} fallback={fallback} />;
}

/**
 * Una foto del panel, o `fallback` si no carga. Va con `key={src}`: con otra foto se vuelve a
 * intentar desde cero.
 */
export function FallbackImage({
  src,
  className,
  fallback,
}: {
  readonly src: string;
  readonly className: string;
  readonly fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // Si la foto falló antes de que React se montara, `onError` ya no se dispara.
  useEffect(() => {
    const node = image.current;
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return fallback;
  return (
    // La ruta redirige a una URL firmada del storage: sin optimización de Next.
    // eslint-disable-next-line @next/next/no-img-element -- la URL final la firma el storage
    <img
      ref={image}
      src={src}
      alt=""
      loading="lazy"
      onError={() => {
        setFailed(true);
      }}
      className={className}
    />
  );
}
