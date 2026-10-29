'use client';

import { useIsClient } from '@norde/ui/lib/use-is-client';
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

// "Entrar a la inmobiliaria": al tocar "Ver propiedades" se van el texto y el botón, y la foto de
// la fachada pasa a ser un video que entra por la puerta (arranca en el mismo cuadro que la foto,
// así que no se nota el cambio). Al final la pantalla se funde con el fondo y aparece el listado.
// El video se ve una vez por sesión; las siguientes veces, o si no arranca a tiempo, la foto se
// acerca a la puerta. Sin JS, con "reducir movimiento" o con un click que abre otra pestaña, el
// link navega normal.

/** Cuánto dura el acercamiento de la foto; el fundido empieza a la mitad. */
const ENTER_MS = 900;
const ZOOM = 4;
/** Si el video no arranca en este tiempo (red lenta), se entra con el acercamiento. */
const VIDEO_WAIT_MS = 1500;
/** Cuánto dura el fundido final después del video. */
const FADE_MS = 450;
const VIDEO_SEEN_KEY = 'norde:hero-entrance-video-seen';

type Stage = 'idle' | 'starting' | 'playing' | 'zooming';

interface EntranceContextValue {
  readonly stage: Stage;
  readonly videoEnabled: boolean;
  readonly registerPhoto: (element: HTMLImageElement | null) => void;
  readonly registerVideo: (element: HTMLVideoElement | null) => void;
  readonly enter: (href: string) => void;
}

const EntranceContext = createContext<EntranceContextValue | null>(null);

function useEntrance(): EntranceContextValue {
  const value = useContext(EntranceContext);
  if (!value) throw new Error('HeroEntrance components must be inside <HeroEntrance>');
  return value;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `sessionStorage` puede fallar (modo privado, cookies bloqueadas): ahí el video se ve siempre. */
function videoSeen(): boolean {
  try {
    return window.sessionStorage.getItem(VIDEO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markVideoSeen(): void {
  try {
    window.sessionStorage.setItem(VIDEO_SEEN_KEY, '1');
  } catch {
    // Sin storage no se recuerda: la próxima vez se vuelve a ver el video.
  }
}

/** Con "ahorro de datos" no se baja el video. */
function saveData(): boolean {
  // `connection` no está en los tipos de TypeScript (solo existe en Chromium).
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/** Lee el `object-position` calculado (`50% 66%`) como proporciones. */
function objectPosition(element: HTMLElement): Point {
  const [x = '50%', y = '50%'] = getComputedStyle(element).objectPosition.split(' ');
  return { x: parseFloat(x) / 100, y: parseFloat(y) / 100 };
}

/**
 * Envuelve el hero: comparte el estado entre la foto, el video y el botón. Mientras entra, los
 * hijos pueden reaccionar con `group-data-[entering=true]/entrance:`.
 */
export function HeroEntrance({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const photo = useRef<HTMLImageElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const timers = useRef<number[]>([]);
  /** A dónde se está entrando; `null` cuando no hay entrada en curso o ya se navegó. */
  const target = useRef<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [leaving, setLeaving] = useState(false);
  // El video se monta después de hidratar: no compite con la foto del hero en la carga.
  const videoEnabled = useIsClient() && !saveData();

  const later = useCallback((callback: () => void, ms: number) => {
    timers.current.push(window.setTimeout(callback, ms));
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => {
      window.clearTimeout(id);
    });
    timers.current = [];
  }, []);

  useEffect(() => {
    // Al volver con "atrás" desde el caché del navegador, la página tiene que estar como antes.
    const reset = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      clearTimers();
      target.current = null;
      setStage('idle');
      setLeaving(false);
    };
    window.addEventListener('pageshow', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
      clearTimers();
    };
  }, [clearTimers]);

  const registerPhoto = useCallback((element: HTMLImageElement | null) => {
    photo.current = element;
  }, []);

  const registerVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
  }, []);

  /** Después del video: funde la pantalla con el fondo y navega. */
  const leave = useCallback(() => {
    const href = target.current;
    if (!href) return;
    target.current = null;
    clearTimers();
    setLeaving(true);
    later(() => {
      router.push(href);
    }, FADE_MS);
  }, [clearTimers, later, router]);

  const zoomToDoor = useCallback(
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
      target.current = null;
      setStage('zooming');
      later(() => {
        router.push(href);
      }, ENTER_MS);
    },
    [later, router],
  );

  const enter = useCallback(
    (href: string) => {
      if (target.current) return;
      target.current = href;
      const element = video.current;
      if (!videoEnabled || !element || videoSeen()) {
        zoomToDoor(href);
        return;
      }

      router.prefetch(href);
      setStage('starting');
      const fallback = () => {
        if (target.current !== href) return;
        clearTimers();
        element.pause();
        zoomToDoor(href);
      };
      later(fallback, VIDEO_WAIT_MS);
      element.addEventListener(
        'playing',
        () => {
          if (target.current !== href) return;
          clearTimers();
          markVideoSeen();
          setStage('playing');
        },
        { once: true },
      );
      element.currentTime = 0;
      element.play().catch(fallback);
    },
    [clearTimers, later, router, videoEnabled, zoomToDoor],
  );

  // Mientras se ve el video: cerca del final (o si el visitante saltea) se pasa al listado.
  useEffect(() => {
    const element = video.current;
    if (stage !== 'playing' || !element) return;
    const check = () => {
      if (element.duration - element.currentTime <= FADE_MS / 1000) leave();
    };
    const skip = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') leave();
    };
    element.addEventListener('timeupdate', check);
    element.addEventListener('ended', leave);
    window.addEventListener('keydown', skip);
    return () => {
      element.removeEventListener('timeupdate', check);
      element.removeEventListener('ended', leave);
      window.removeEventListener('keydown', skip);
    };
  }, [stage, leave]);

  const value = useMemo(
    () => ({ stage, videoEnabled, registerPhoto, registerVideo, enter }),
    [stage, videoEnabled, registerPhoto, registerVideo, enter],
  );

  return (
    <EntranceContext.Provider value={value}>
      {/* `group/entrance`: el texto del hero se desvanece mientras entra. */}
      <div data-entering={stage !== 'idle'} className="group/entrance contents">
        {children}
      </div>
      {/* Mientras se ve el video, un click en cualquier lado (o el botón) lo saltea. */}
      {stage === 'playing' && !leaving && (
        <div className="fixed inset-0 z-(--z-overlay) cursor-pointer" onClick={leave}>
          <button
            type="button"
            className="hero-skip-in absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full border border-white/40 bg-black/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors outline-none hover:bg-black/55 focus-visible:ring-[3px] focus-visible:ring-white/50"
          >
            Saltar
          </button>
        </div>
      )}
      <div
        aria-hidden
        className={cn(
          'bg-background pointer-events-none fixed inset-0 z-(--z-overlay) opacity-0',
          stage === 'zooming' && 'hero-entrance-fade',
          leaving && 'hero-entrance-fade-now',
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
  /** Video de la entrada: su primer cuadro es la misma foto, con el mismo encuadre y proporción. */
  readonly video?: string;
  /** Acercamiento de base, para recortar una foto que entra demasiado abierta. */
  readonly zoom?: number;
  readonly className?: string;
}

/**
 * La foto del hero: se mueve lento en reposo y, al entrar, pasa a ser el video o se acerca a la
 * puerta.
 */
export function HeroPhoto({ src, alt, door, video, zoom = 1, className }: HeroPhotoProps) {
  const { stage, videoEnabled, registerPhoto, registerVideo } = useEntrance();
  const zooming = stage === 'zooming';

  return (
    <div
      className={cn('hero-drift absolute inset-0 -z-10', stage !== 'idle' && 'hero-drift-paused')}
    >
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
            zooming && 'duration-900',
            className,
          )}
          style={zooming ? { transform: `scale(${ZOOM})` } : undefined}
        />
        {/* Mismo recorte que la foto (`object-cover` y la misma posición): el primer cuadro calza. */}
        {video && videoEnabled && (
          <video
            ref={registerVideo}
            src={video}
            muted
            playsInline
            preload="auto"
            aria-hidden
            className={cn(
              'absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-450',
              stage === 'playing' && 'opacity-100',
              className,
            )}
          />
        )}
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
  const { stage, enter } = useEntrance();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (newTab || event.button !== 0 || prefersReducedMotion()) return;
    event.preventDefault();
    if (stage === 'idle') enter(href);
  };

  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
