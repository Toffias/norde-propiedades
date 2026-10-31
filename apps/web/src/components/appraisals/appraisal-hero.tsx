import { ChevronDown, ClipboardCheck, House, Scale } from 'lucide-react';

import magnifier from '../../assets/tasacion-lupa.webp';
import { PhotoHero } from '../layout/photo-hero';
import { ScrollFade } from './scroll-fade';

const HIGHLIGHTS = [
  { label: 'Visitamos la propiedad', icon: House },
  { label: 'Comparables de la zona', icon: Scale },
  { label: 'Informe con el valor sugerido', icon: ClipboardCheck },
] as const;

/** Portada de Tasaciones: la casa bajo la lupa a pantalla completa, con el único H1. */
export function AppraisalHero({ description }: { readonly description: string }) {
  return (
    <PhotoHero
      image={magnifier}
      alt="Una persona examina con una lupa la maqueta de una casa"
      // La casa está a la derecha: en mobile el recorte la mantiene a la vista.
      imageClassName="object-[80%_center]"
      labelledBy="appraisal-title"
    >
      <ScrollFade className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pt-24 pb-20 sm:px-10 sm:pt-28 sm:pb-28">
        <div className="mt-auto flex flex-col gap-5 pt-10">
          <p className="rise-in text-xs font-bold tracking-[0.18em] text-white/90 uppercase">
            Tasaciones
          </p>
          <h1
            id="appraisal-title"
            className="rise-in max-w-4xl text-[2.75rem] leading-[0.95] font-extrabold text-balance text-white sm:text-7xl lg:text-8xl"
            style={{ animationDelay: '120ms' }}
          >
            ¿Cuánto vale hoy tu propiedad?
          </h1>
          <div
            aria-hidden
            className="about-deco-on-photo rise-in"
            style={{ animationDelay: '220ms' }}
          />
          <p
            className="rise-in max-w-2xl text-base text-white/90 sm:text-xl"
            style={{ animationDelay: '300ms' }}
          >
            {description}
          </p>
          <div className="rise-in flex flex-wrap gap-3" style={{ animationDelay: '420ms' }}>
            <a
              href="#pedir-tasacion"
              className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 inline-flex h-12 items-center rounded-xl px-6 text-sm font-bold transition-colors outline-none focus-visible:ring-[3px]"
            >
              Pedir tasación
            </a>
            <a
              href="#proceso"
              className="inline-flex h-12 items-center rounded-xl border border-white/40 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-sm transition-colors outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/50"
            >
              Cómo trabajamos
            </a>
          </div>
          <ul
            className="rise-in mt-2 hidden flex-wrap gap-2 sm:flex"
            style={{ animationDelay: '540ms' }}
            aria-label="Qué incluye la tasación"
          >
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm sm:text-sm"
              >
                <item.icon aria-hidden className="size-4 text-white" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </ScrollFade>

      <a
        href="#proceso"
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-xs font-semibold text-white/80 transition-colors hover:text-white"
      >
        Conocé el proceso
        <ChevronDown aria-hidden className="scroll-cue size-5" />
      </a>
    </PhotoHero>
  );
}
