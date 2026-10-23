import { ArrowRight } from 'lucide-react';

import facade from '../../assets/fachada-norde.jpg';
import { routes } from '../../lib/seo/routes';
import { EnterLink, HeroEntrance, HeroPhoto } from './hero-entrance';

/** La puerta del 7250 en la foto de la fachada (proporción del ancho y del alto). */
const FACADE_DOOR = { x: 0.507, y: 0.74 };

/**
 * Hero de la home: la fachada de la oficina a todo el ancho, con movimiento lento, y el llamado
 * a ver las propiedades, que "entra" por la puerta. El header queda transparente encima.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="hero-title">
      <HeroEntrance>
        <div className="bg-ink relative isolate overflow-hidden">
          <HeroPhoto
            src={facade}
            alt="Fachada de la oficina de Norde Propiedades en Av. Emilio Castro 7250"
            door={FACADE_DOOR}
            className="object-[center_62%]"
          />
          {/* Oscurece arriba (header), al centro (texto) y abajo, sin tapar la puerta. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.55),transparent_70%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-transparent to-black/50"
          />
          <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-4xl flex-col items-center justify-center px-5 pt-28 pb-20 text-center [text-shadow:0_1px_14px_rgb(0_0_0/0.55)] transition-opacity duration-300 group-data-[entering=true]/entrance:opacity-0 sm:pt-32">
            <h1
              id="hero-title"
              className="text-4xl leading-[1.05] font-extrabold text-white sm:text-6xl lg:text-7xl"
            >
              Te ayudamos a encontrar tu lugar en el barrio
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-white/90 sm:text-xl">
              Casas, departamentos y PH en venta y alquiler, con asesoramiento en cada paso.
            </p>
            <EnterLink
              href={routes.properties()}
              className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 mt-8 inline-flex h-13 items-center gap-2 rounded-full px-7 text-base font-bold shadow-lg transition-colors outline-none focus-visible:ring-[3px]"
            >
              Ver propiedades
              <ArrowRight aria-hidden className="size-5" />
            </EnterLink>
          </div>
        </div>
      </HeroEntrance>
    </section>
  );
}
