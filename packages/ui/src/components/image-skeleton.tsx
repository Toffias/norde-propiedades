'use client';

import { useCallback, useState, type ComponentProps, type Ref, type RefCallback } from 'react';

import { cn } from '../lib/utils';

/**
 * Mientras una imagen carga, `image-skeleton` (en los temas) la muestra como un placeholder que
 * late. Si la imagen ya cargó (o falló) antes de que React se montara, `onLoad` y `onError` no se
 * disparan: el `ref` lo detecta con `complete`.
 */
export function useImageSkeleton(): {
  readonly className: string | undefined;
  readonly ref: RefCallback<HTMLImageElement>;
  readonly done: () => void;
} {
  const [loading, setLoading] = useState(true);
  const done = useCallback(() => {
    setLoading(false);
  }, []);
  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoading(false);
  }, []);
  return { className: loading ? 'image-skeleton' : undefined, ref, done };
}

/**
 * Un `<img>` con skeleton de carga. Para fotos que no pasan por `next/image` (las del panel las
 * firma el storage). Si cambia `src`, va con `key={src}` para volver a mostrar el skeleton.
 */
export function SkeletonImg({ className, ref, onLoad, onError, ...props }: ComponentProps<'img'>) {
  const skeleton = useImageSkeleton();
  return (
    <img
      {...props}
      ref={mergeRefs(skeleton.ref, ref)}
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

function mergeRefs<T>(own: RefCallback<T>, other: Ref<T> | undefined): RefCallback<T> {
  return (node) => {
    own(node);
    if (typeof other === 'function') other(node);
    else if (other) other.current = node;
  };
}
