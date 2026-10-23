'use client';

import { cn } from '@norde/ui/lib/utils';
import { useCallback, useRef, type ReactNode } from 'react';

import { useScrollFrame } from './use-scroll-frame';

interface ParallaxProps {
  /**
   * Cuánto se desplaza respecto del scroll: positivo va más lento que la página, negativo más
   * rápido. El contenedor tiene que tener `overflow-hidden` y el hijo, margen para moverse.
   */
  readonly speed: number;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Capa que se mueve a otro ritmo que el scroll, según su distancia al centro de la pantalla. */
export function Parallax({ speed, className, children }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onFrame = useCallback(
    (element: HTMLDivElement, _rect: DOMRect, viewportHeight: number) => {
      // Se mide el contenedor: medir la capa que se mueve realimentaría el desplazamiento.
      const box = element.parentElement?.getBoundingClientRect();
      if (!box || box.bottom < -100 || box.top > viewportHeight + 100) return;
      const offset = (box.top + box.height / 2 - viewportHeight / 2) * speed;
      element.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    },
    [speed],
  );
  useScrollFrame(ref, onFrame);

  return (
    <div ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </div>
  );
}
