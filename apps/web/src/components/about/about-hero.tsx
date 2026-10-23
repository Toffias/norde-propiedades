import Image from 'next/image';

import facade from '../../assets/fachada-norde.jpg';
import { Parallax } from './parallax';

/** Portada de Nosotros: la fachada de la oficina en parallax, con el único H1 de la página. */
export function AboutHero({ intro }: { readonly intro: string }) {
  return (
    <section aria-labelledby="about-title" className="px-2 sm:px-4">
      <div className="bg-ink relative isolate mx-auto h-[26rem] max-w-[96rem] overflow-hidden rounded-[28px] sm:h-[34rem] lg:h-[38rem]">
        <Parallax speed={0.25} className="absolute inset-x-0 -inset-y-[18%] -z-10">
          <Image
            src={facade}
            alt="Fachada de Norde Propiedades en la esquina de Av. Emilio Castro 7250"
            fill
            priority
            placeholder="blur"
            sizes="100vw"
            className="object-cover object-[center_40%]"
          />
        </Parallax>
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-black/5 via-black/20 to-black/70"
        />
        <div className="mx-auto flex h-full max-w-7xl flex-col justify-end gap-4 px-5 pb-8 sm:px-10 sm:pb-12">
          <p className="text-xs font-bold tracking-[0.14em] text-white/90 uppercase">Nosotros</p>
          <h1
            id="about-title"
            className="text-5xl leading-none font-extrabold text-white sm:text-7xl"
          >
            Somos Norde
          </h1>
          <div aria-hidden className="about-deco-on-photo" />
          <p className="max-w-2xl text-lg text-white/90">{intro}</p>
        </div>
      </div>
    </section>
  );
}
