'use client';

import { cn } from '@norde/ui/lib/utils';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { coverPoint, type Point } from '../../lib/images/cover-point';

// "Entrar a la inmobiliaria": al tocar "Ver propiedades", la foto de la fachada se acerca a la
// puerta, la pantalla se funde con el fondo y aparece el listado. Sin JS, con "reducir
// movimiento" o con un click que abre otra pestaña, el link navega normal.

/** Cuánto dura el acercamiento; el fundido empieza a la mitad. */
const ENTER_MS = 900;
const ZOOM = 4;

interface EntranceContextValue {
  readonly entering: boolean;
  readonly registerPhoto: (element: HTMLImageElement | null) => void;
  readonly enter: (href: string) => void;
}

const EntranceContext = createContext<EntranceContextValue | null>(null);

function useEntrance(): EntranceContextValue {
  const value = useContext(EntranceContext);
  if (!value) throw new Error('HeroEntrance components must be inside <HeroEntrance>');
  return value;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lee el `object-position` calculado (`50% 66%`) como proporciones. */
function objectPosition(element: HTMLElement): Point {
  const [x = '50%', y = '50%'] = getComputedStyle(element).objectPosition.split(' ');
  return { x: parseFloat(x) / 100, y: parseFloat(y) / 100 };
}

/**
 * Envuelve el hero: comparte el estado entre la foto y el botón. Mientras entra, los hijos
 * pueden reaccionar con `group-data-[entering=true]/entrance:`.
 */
export function HeroEntrance({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const photo = useRef<HTMLImageElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [entering, setEntering] = useState(false);

  // Al volver con "atrás" desde el caché del navegador, la página tiene que estar como antes.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setEntering(false);
    };
    window.addEventListener('pageshow', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
      window.clearTimeout(timer.current);
    };
  }, []);

  const registerPhoto = useCallback((element: HTMLImageElement | null) => {
    photo.current = element;
  }, []);

  const enter = useCallback(
    (href: string) => {
      const element = photo.current;
      if (element) {
        const door = coverPoint(
          { width: element.clientWidth, height: element.clientHeight },
          { width: element.naturalWidth || 1, height: element.naturalHeight || 1 },
          objectPosition(element),
          { x: Number(element.dataset.doorX), y: Number(element.dataset.doorY) },
        );
        element.style.transformOrigin = `${door.x.toFixed(1)}px ${door.y.toFixed(1)}px`;
      }
      setEntering(true);
      timer.current = window.setTimeout(() => {
        router.push(href);
      }, ENTER_MS);
    },
    [router],
  );

  const value = useMemo(
    () => ({ entering, registerPhoto, enter }),
    [entering, registerPhoto, enter],
  );

  return (
    <EntranceContext.Provider value={value}>
      {/* `group/entrance`: el texto del hero se desvanece mientras la foto se acerca. */}
      <div data-entering={entering} className="group/entrance contents">
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'bg-background pointer-events-none fixed inset-0 z-(--z-overlay) opacity-0',
          entering && 'hero-entrance-fade',
        )}
      />
    </EntranceContext.Provider>
  );
}

interface HeroPhotoProps {
  readonly src: StaticImageData;
  readonly alt: string;
  /** Dónde está la puerta en la foto original, en proporción del ancho y del alto. */
  readonly door: Point;
  /** Acercamiento de base, para recortar una foto que entra demasiado abierta. */
  readonly zoom?: number;
  readonly className?: string;
}

/** La foto del hero: se mueve lento en reposo y se acerca a la puerta al entrar. */
export function HeroPhoto({ src, alt, door, zoom = 1, className }: HeroPhotoProps) {
  const { entering, registerPhoto } = useEntrance();

  return (
    <div className={cn('hero-drift absolute inset-0 -z-10', entering && 'hero-drift-paused')}>
      {/* El zoom de base va en su propia capa: el acercamiento a la puerta se calcula sin él. */}
      <div className="absolute inset-0" style={{ transform: `scale(${zoom})` }}>
        <Image
          ref={registerPhoto}
          src={src}
          alt={alt}
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          data-door-x={door.x}
          data-door-y={door.y}
          className={cn(
            'object-cover transition-transform ease-in',
            entering && 'duration-900',
            className,
          )}
          style={entering ? { transform: `scale(${ZOOM})` } : undefined}
        />
      </div>
    </div>
  );
}

interface EnterLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** "Ver propiedades": entra con la animación; si no se puede animar, es un link común. */
export function EnterLink({ href, className, children }: EnterLinkProps) {
  const { entering, enter } = useEntrance();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (newTab || event.button !== 0 || prefersReducedMotion()) return;
    event.preventDefault();
    if (!entering) enter(href);
  };

  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
