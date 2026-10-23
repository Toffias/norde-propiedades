import { cn } from '@norde/ui/lib/utils';
import Image from 'next/image';

import facade from '../../assets/fachada-norde.jpg';
import type { Milestone } from '../../lib/about/about-content';
import { MediaImage } from '../blog/media-image';
import { Parallax } from './parallax';
import { Reveal } from './reveal';
import { TimelineRail } from './timeline-rail';

/** Recortes de la fachada para los hitos sin foto propia: cada uno muestra otra parte. */
const FACADE_CROPS = ['object-[center_62%]', 'object-[center_88%]', 'object-[center_18%]'];

const IMAGE_SIZES = '(min-width: 768px) 36rem, 100vw';

function MilestoneImage({
  milestone,
  index,
}: {
  readonly milestone: Milestone;
  readonly index: number;
}) {
  if (milestone.image) {
    return <MediaImage media={milestone.image} sizes={IMAGE_SIZES} className="size-full" />;
  }
  return (
    <Image
      src={facade}
      alt=""
      fill
      placeholder="blur"
      sizes={IMAGE_SIZES}
      className={cn('scale-150 object-cover', FACADE_CROPS[index % FACADE_CROPS.length])}
    />
  );
}

/** La historia de Norde: una línea de tiempo que se pinta al bajar, con fotos en parallax. */
export function HistoryTimeline({ milestones }: { readonly milestones: readonly Milestone[] }) {
  if (milestones.length === 0) return null;

  return (
    <section aria-labelledby="history-title" className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 id="history-title" className="sr-only">
        Nuestra historia
      </h2>
      <div className="relative py-4">
        <div
          aria-hidden
          className="bg-border absolute top-4 bottom-4 left-[7px] w-0.5 md:left-1/2 md:-translate-x-1/2"
        >
          <TimelineRail className="absolute inset-0" />
        </div>
        <ol className="space-y-14 md:space-y-20">
          {milestones.map((milestone, index) => (
            <Reveal
              as="li"
              key={milestone.id}
              className="relative grid items-center gap-4 pl-8 md:grid-cols-2 md:gap-14 md:pl-0"
            >
              <span
                aria-hidden
                className="border-primary bg-background absolute top-3 left-0 size-4 rounded-full border-[3px] md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
              />
              <div className={cn('min-w-0 space-y-2', index % 2 === 1 && 'md:order-2')}>
                <p className="text-primary text-sm font-bold tracking-[0.14em] uppercase">
                  {milestone.label}
                </p>
                <h3 className="text-2xl leading-tight font-extrabold">{milestone.title}</h3>
                <p className="text-muted-foreground">{milestone.text}</p>
              </div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
                <Parallax speed={-0.12} className="absolute inset-x-0 -inset-y-[14%]">
                  <div className="relative size-full">
                    <MilestoneImage milestone={milestone} index={index} />
                  </div>
                </Parallax>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
