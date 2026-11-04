'use client';

import { cn } from '@norde/ui/lib/utils';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { routes } from '../../lib/seo/routes';

/** A partir de cuántos píxeles de scroll el header deja de ser transparente. */
const SOLID_AFTER_PX = 24;

/**
 * En la home, hasta qué parte del alto de la pantalla el header escondido conserva el aspecto
 * transparente: así al empezar a bajar solo se desvanece, sin cambiar de forma.
 */
const NEAR_TOP_SHARE = 0.4;

/** Las páginas que arrancan con una foto a pantalla completa debajo del header. */
const PHOTO_PATHS: readonly string[] = [routes.home(), routes.appraisals(), routes.contact()];

/**
 * Marca, en la home, dónde empieza el contenido que sube sobre el hero ("cortina"). El header
 * aparece cuando esa marca llega arriba.
 */
const HEADER_REVEAL_ATTRIBUTE = 'data-header-reveal';

/**
 * El `<header>` del sitio, con la barra de contacto (`topBar`) arriba.
 *
 * - En las páginas con foto de portada (home, Tasaciones, Nosotros y contacto), barra y header van
 *   fijos arriba, encima de la foto. Con el scroll arriba de todo se ve solo el header,
 *   transparente; la barra aparece (se despliega) cuando el header se vuelve sólido. Los hijos se
 *   adaptan con `group-data-[overlay=true]/header:`.
 * - En la home, además, al empezar a bajar el header se desvanece, y barra y header aparecen
 *   juntos, sólidos, cuando el contenido que sube sobre la foto llega al borde de arriba (la marca
 *   `data-header-reveal`). Al volver a subir se repite al revés. Si algo adentro toma el foco con
 *   el teclado, se muestran.
 * - En el resto, la barra queda arriba y el header, pegado al bajar.
 *
 * Tiene su propio `view-transition-name`: sin él, al navegar (por ejemplo, al aplicar un filtro con
 * el scroll abajo) la captura del contenido se dibuja encima y el header desaparece un instante.
 */
export function HeaderShell({
  topBar,
  children,
}: {
  readonly topBar: ReactNode;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === routes.home();
  const overPhoto = PHOTO_PATHS.includes(pathname);
  const [atTop, setAtTop] = useState(true);
  const [nearTop, setNearTop] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const chrome = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overPhoto) return;
    const update = () => {
      setAtTop(window.scrollY <= SOLID_AFTER_PX);
      if (!isHome) return;
      const mark = document.querySelector(`[${HEADER_REVEAL_ATTRIBUTE}]`);
      const height = chrome.current?.offsetHeight ?? 0;
      // Sin la marca (la home sin contenido debajo del hero), el header se muestra siempre.
      setRevealed(!mark || mark.getBoundingClientRect().top <= height);
      setNearTop(window.scrollY < window.innerHeight * NEAR_TOP_SHARE);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [overPhoto, isHome]);

  // Transparente y sin la barra: arriba de todo y, en la home, mientras se desvanece al bajar.
  const transparent = overPhoto && (isHome ? !revealed && nearTop : atTop);
  // Solo en la home: escondido entre el hero y el contenido.
  const homeHidden = isHome && !revealed && !atTop;

  const header = (
    <header
      data-overlay={transparent}
      className={cn(
        'group/header z-(--z-sticky) border-b [view-transition-name:site-header] transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none',
        !overPhoto && 'sticky top-0',
        transparent
          ? 'border-transparent bg-transparent [--ink:var(--color-white)]'
          : 'bg-background/90 supports-[backdrop-filter]:bg-background/75 backdrop-blur',
      )}
    >
      {children}
    </header>
  );

  if (!overPhoto) {
    return (
      <>
        {topBar}
        {header}
      </>
    );
  }

  return (
    <div
      ref={chrome}
      data-revealed={revealed}
      data-at-top={atTop}
      className={cn(
        'fixed inset-x-0 top-0 z-(--z-sticky) transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] focus-within:translate-y-0 focus-within:opacity-100 motion-reduce:transition-none',
        transparent && 'duration-300',
        homeHidden && 'pointer-events-none opacity-0',
        homeHidden && !transparent && '-translate-y-full',
      )}
    >
      {/* Sobre la foto, solo el header: la barra se despliega cuando el header se vuelve sólido. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none',
          transparent ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={transparent}>
          {topBar}
        </div>
      </div>
      {header}
    </div>
  );
}
