'use client';

import { useCallback, useRef } from 'react';

import { useScrollFrame } from './use-scroll-frame';

/**
 * La línea de la historia: se pinta de rojo a medida que se baja. Sin movimiento (o sin JS)
 * queda pintada entera.
 */
export function TimelineRail({ className }: { readonly className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onFrame = useCallback((element: HTMLDivElement, _rect: DOMRect, viewportHeight: number) => {
    const track = element.parentElement?.getBoundingClientRect();
    if (!track) return;
    const progress = Math.min(1, Math.max(0, (viewportHeight * 0.6 - track.top) / track.height));
    element.style.transform = `scaleY(${progress.toFixed(4)})`;
  }, []);
  useScrollFrame(ref, onFrame);

  return (
    <div aria-hidden className={className}>
      <div ref={ref} className="bg-primary size-full origin-top" />
    </div>
  );
}
