'use client';

import { cn } from '@norde/ui/lib/utils';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { routes } from '../../lib/seo/routes';

/** A partir de cuántos píxeles de scroll el header deja de ser transparente. */
const SOLID_AFTER_PX = 24;

/** Las páginas que arrancan con una foto a pantalla completa debajo del header. */
const OVERLAY_PATHS: readonly string[] = [routes.home(), routes.appraisals(), routes.contact()];

/**
 * El `<header>` del sitio. En las páginas con foto de portada arranca transparente, sobre la foto,
 * y se vuelve sólido al bajar. Los hijos se adaptan con `group-data-[overlay=true]/header:`.
 */
export function HeaderShell({ children }: { readonly children: ReactNode }) {
  const overHero = OVERLAY_PATHS.includes(usePathname());
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    const update = () => {
      setScrolled(window.scrollY > SOLID_AFTER_PX);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
    };
  }, [overHero]);

  const overlay = overHero && !scrolled;

  return (
    <header
      data-overlay={overlay}
      className={cn(
        'group/header sticky top-0 z-(--z-sticky) border-b transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none',
        // La portada sube por debajo del header (mismo alto: h-16 / sm:h-20).
        overHero && '-mb-16 sm:-mb-20',
        overlay
          ? 'border-transparent bg-transparent [--ink:var(--color-white)]'
          : 'bg-background/90 supports-[backdrop-filter]:bg-background/75 backdrop-blur',
      )}
    >
      {children}
    </header>
  );
}
