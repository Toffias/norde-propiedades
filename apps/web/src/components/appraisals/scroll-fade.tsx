'use client';

import { cn } from '@norde/ui/lib/utils';
import { useCallback, useRef, type ReactNode } from 'react';

import { useScrollFrame } from '../about/use-scroll-frame';

/**
 * Contenido de una portada que se desvanece y sube a medida que la portada sale de pantalla.
 * Sin movimiento (o sin JS) queda quieto y visible.
 */
export function ScrollFade({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onFrame = useCallback((element: HTMLDivElement) => {
    // Se mide la portada: medir el contenido que se mueve realimentaría el desplazamiento.
    const box = element.parentElement?.getBoundingClientRect();
    if (!box || box.bottom < 0) return;
    const progress = Math.min(1, Math.max(0, -box.top / (box.height * 0.7)));
    element.style.opacity = (1 - progress * 0.9).toFixed(3);
    element.style.transform = `translate3d(0, ${(progress * -48).toFixed(1)}px, 0)`;
  }, []);
  useScrollFrame(ref, onFrame);

  return (
    <div ref={ref} className={cn('will-change-[opacity,transform]', className)}>
      {children}
    </div>
  );
}
