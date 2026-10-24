'use client';

import { useEffect, type RefObject } from 'react';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Llama a `onFrame` con la posición del elemento en cada scroll (a lo sumo una vez por frame).
 * Con "reducir movimiento" activado no hace nada: el elemento queda en su estado de reposo.
 */
export function useScrollFrame<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onFrame: (element: T, rect: DOMRect, viewportHeight: number) => void,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      onFrame(element, element.getBoundingClientRect(), window.innerHeight);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [ref, onFrame]);
}
