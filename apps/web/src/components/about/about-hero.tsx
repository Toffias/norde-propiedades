import team from '../../assets/contacto-equipo.jpg';
import { ScrollFade } from '../appraisals/scroll-fade';
import { PhotoHero } from '../layout/photo-hero';

/** Portada de Nosotros: un equipo trabajando a pantalla completa, con el único H1. */
export function AboutHero({ intro }: { readonly intro: string }) {
  return (
    <PhotoHero
      image={team}
      alt="Un equipo de trabajo reunido alrededor de una notebook"
      imageClassName="object-[center_30%]"
      labelledBy="about-title"
    >
      <ScrollFade className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pt-24 pb-16 sm:px-10 sm:pt-28 sm:pb-24">
        <div className="mt-auto flex flex-col gap-4 pt-10">
          <p className="rise-in text-xs font-bold tracking-[0.18em] text-white/90 uppercase">
            Nosotros
          </p>
          <h1
            id="about-title"
            className="rise-in text-white font-display text-[2.5rem] leading-[0.95] font-normal tracking-normal sm:text-6xl lg:text-[clamp(3.5rem,5.2vw,6rem)]"
            style={{ animationDelay: '120ms' }}
          >
            Somos Norde
          </h1>
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
