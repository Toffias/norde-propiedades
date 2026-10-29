'use client';

import { useCallback, useRef } from 'react';

import { useScrollFrame } from '../about/use-scroll-frame';

/** Opacidad en reposo, antes de que el paso llegue a la altura donde se pinta la línea. */
const IDLE_OPACITY = 0.4;

/**
 * El número de un paso del proceso: se enciende (de 40 % a 100 %) a medida que sube hasta la
 * altura donde la línea se pinta de rojo (60 % de la pantalla). Sin movimiento queda tenue.
 */
export function StepNumber({ value }: { readonly value: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const onFrame = useCallback(
    (element: HTMLParagraphElement, rect: DOMRect, viewportHeight: number) => {
      const start = viewportHeight * 0.85;
      const end = viewportHeight * 0.6;
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
      element.style.opacity = (IDLE_OPACITY + (1 - IDLE_OPACITY) * progress).toFixed(3);
    },
    [],
  );
  useScrollFrame(ref, onFrame);

  return (
    <p
      ref={ref}
      className="text-primary text-4xl leading-none font-extrabold tabular-nums opacity-40 sm:text-6xl"
    >
      {value}
    </p>
  );
}
