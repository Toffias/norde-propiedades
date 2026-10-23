'use client';

import { useEffect, useRef, useState } from 'react';

import { formatStat, type AboutStat } from '../../lib/about/about-content';

const DURATION_MS = 1400;

/**
 * Cifra que cuenta desde cero al aparecer en pantalla. El HTML del servidor ya trae el valor
 * final (lo leen los buscadores y quien tenga "reducir movimiento").
 */
export function CountUp({
  stat,
}: {
  readonly stat: Pick<AboutStat, 'value' | 'prefix' | 'suffix'>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(stat.value);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / DURATION_MS);
          setValue(Math.round(stat.value * (1 - (1 - progress) ** 3)));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stat.value]);

  return (
    <span ref={ref} className="tabular-nums">
      {formatStat({ ...stat, value })}
    </span>
  );
}
