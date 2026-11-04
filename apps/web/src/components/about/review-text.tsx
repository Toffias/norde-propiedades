'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * El texto de una reseña, cortado a unas líneas con "Más" para leerlo entero, como en Google.
 * El botón aparece solo si el texto no entra.
 */
export function ReviewText({ text }: { readonly text: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    const measure = () => {
      setOverflows(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [expanded]);

  return (
    <div className="text-sm leading-relaxed">
      <p
        ref={ref}
        className={expanded ? 'whitespace-pre-line' : 'line-clamp-6 whitespace-pre-line'}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => {
            setExpanded((value) => !value);
          }}
          aria-expanded={expanded}
          className="text-muted-foreground hover:text-foreground mt-1 text-sm font-bold"
        >
          {expanded ? 'Menos' : 'Más'}
        </button>
      )}
    </div>
  );
}
