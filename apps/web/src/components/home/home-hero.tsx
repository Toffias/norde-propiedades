import { ArrowRight } from 'lucide-react';

import facade from '../../assets/fachada-norde.webp';
import { routes } from '../../lib/seo/routes';
import { EnterLink, HeroEntrance, HeroPhoto } from './hero-entrance';

/** La puerta del 7250 en la foto de la fachada (proporción del ancho y del alto). */
const FACADE_DOOR = { x: 0.505, y: 0.77 };

/**
 * Video de la entrada por la puerta. Su primer cuadro es la foto de la fachada con el mismo
 * recorte 16:9: si se cambia uno, hay que cambiar el otro.
 */
const ENTRANCE_VIDEO = '/videos/entrada-norde.mp4';

/**
 * Hero de la home: la fachada de la oficina a todo el ancho, con movimiento lento, y el llamado
 * a ver las propiedades, que "entra" por la puerta en video. El header no se ve encima: aparece al llegar al contenido (ver `HeaderShell`).
 */
export function HomeHero() {
  return (
    // Queda pegado arriba mientras el resto de la home sube encima (ver `page.tsx`).
    <section aria-labelledby="hero-title" className="sticky top-0">
      <HeroEntrance>
        <div className="bg-ink relative isolate overflow-hidden">
          {/* Al bajar, la foto se agranda apenas y se desenfoca (`.hero-curtain-photo`). */}
          <div className="hero-curtain-photo absolute inset-0 -z-10">
            <HeroPhoto
              src={facade}
              alt="Fachada de la oficina de Norde Propiedades en Av. Emilio Castro 7250"
              door={FACADE_DOOR}
              video={ENTRANCE_VIDEO}
              zoom={1.08}
              className="object-[center_70%]"
            />
          </div>
          {/* Oscurece arriba (header) y abajo a la izquierda (texto), sin tapar la puerta. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-transparent via-40% to-black/70"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-black/35 via-transparent via-60% to-transparent"
          />
          {/* Se oscurece a medida que el contenido la tapa. */}
          <div
            aria-hidden
            className="hero-curtain-shade absolute inset-0 -z-10 bg-black opacity-0"
          />
          <div className="mx-auto flex min-h-svh max-w-7xl flex-col justify-end px-4 pt-28 pb-24 text-white transition-opacity duration-300 group-data-[entering=true]/entrance:opacity-0 sm:px-6 sm:pb-28">
            <div className="hero-curtain-text flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="[text-shadow:0_1px_18px_rgb(0_0_0/0.45)]">
                <p
                  className="rise-in text-xs font-medium tracking-[0.18em] text-white/85 uppercase sm:text-sm sm:tracking-[0.25em]"
                  style={{ animationDelay: '150ms' }}
                >
                  Casas, departamentos y PH · Oeste de CABA y GBA
                </p>
                <h1
                  id="hero-title"
                  className="font-display rise-in mt-4 text-[2.5rem] leading-[0.95] font-normal tracking-normal sm:text-6xl lg:text-[clamp(3.5rem,5.2vw,6rem)] lg:whitespace-nowrap"
                  style={{ animationDelay: '300ms' }}
                >
                  Encontrá tu lugar
                </h1>
              </div>
              <div className="rise-in shrink-0" style={{ animationDelay: '550ms' }}>
                <EnterLink
                  href={routes.properties()}
                  className="focus-visible:ring-ring/50 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-neutral-900 shadow-lg transition-colors outline-none hover:bg-white/85 focus-visible:ring-[3px]"
                >
                  Ver propiedades
                  <ArrowRight aria-hidden className="size-5" />
                </EnterLink>
              </div>
            </div>
          </div>
        </div>
      </HeroEntrance>
    </section>
  );
}
