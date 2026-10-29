import facade from '../../assets/fachada-norde.jpg';
import { ScrollFade } from '../appraisals/scroll-fade';
import { PhotoHero } from '../layout/photo-hero';

/** Portada de Nosotros: la fachada a pantalla completa, con el único H1. */
export function AboutHero({ intro }: { readonly intro: string }) {
  return (
    <PhotoHero
      image={facade}
      alt="Fachada de Norde Propiedades en la esquina de Av. Emilio Castro 7250"
      imageClassName="object-[center_40%]"
      labelledBy="about-title"
    >
      <ScrollFade className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pt-24 pb-16 sm:px-10 sm:pt-28 sm:pb-24">
        <div className="mt-auto flex flex-col gap-4 pt-10">
          <p className="rise-in text-xs font-bold tracking-[0.18em] text-white/90 uppercase">
            Nosotros
          </p>
          <h1
            id="about-title"
            className="rise-in text-5xl leading-none font-extrabold text-white sm:text-7xl lg:text-8xl"
            style={{ animationDelay: '120ms' }}
          >
            Somos Norde
          </h1>
          <div
            aria-hidden
            className="about-deco-on-photo rise-in"
            style={{ animationDelay: '220ms' }}
          />
          <p
            className="rise-in max-w-2xl text-lg text-white/90 sm:text-xl"
            style={{ animationDelay: '300ms' }}
          >
            {intro}
          </p>
        </div>
      </ScrollFade>
    </PhotoHero>
  );
}
