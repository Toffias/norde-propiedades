'use client';

import { cn } from '@norde/ui/lib/utils';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  readonly as?: 'div' | 'li';
  readonly className?: string;
  /** Demora de la animación, para que una fila de tarjetas entre en cascada. */
  readonly delayMs?: number;
  readonly children: ReactNode;
}

/**
 * Anima la entrada del contenido la primera vez que aparece en pantalla. Arranca visible (el
 * HTML del servidor ya se lee completo); la animación es un extra (`.about-reveal`).
 */
export function Reveal({ as: Tag = 'div', className, delayMs = 0, children }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const setRef = useCallback((element: HTMLElement | null) => {
    ref.current = element;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={setRef}
      className={cn(shown && 'about-reveal', className)}
      style={delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
