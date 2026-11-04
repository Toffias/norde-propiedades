import { ArrowUpRight, Star } from 'lucide-react';

import {
  authorInitial,
  avatarColor,
  reviewAge,
  type GoogleReviewCard,
} from '../../lib/about/google-reviews';
import { MediaImage } from '../blog/media-image';
import { GoogleIcon } from '../brand/google-icon';
import { SectionHeading } from '../layout/section-heading';
import { Reveal } from './reveal';
import { ReviewText } from './review-text';

function Stars({ rating }: { readonly rating: number }) {
  return (
    <span role="img" aria-label={`${rating} de 5 estrellas`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden
          className={
            value <= rating
              ? 'size-4 fill-[#fbbc04] text-[#fbbc04]'
              : 'fill-muted text-muted size-4'
          }
        />
      ))}
    </span>
  );
}

function Avatar({ review }: { readonly review: GoogleReviewCard }) {
  if (review.authorPhoto) {
    return (
      <div className="bg-muted size-10 shrink-0 overflow-hidden rounded-full">
        <MediaImage media={review.authorPhoto} sizes="40px" className="size-full" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full text-lg font-medium text-white"
      style={{ backgroundColor: avatarColor(review.authorName) }}
    >
      {authorInitial(review.authorName)}
    </div>
  );
}

function ReviewCard({ review, now }: { readonly review: GoogleReviewCard; readonly now: Date }) {
  return (
    <article className="bg-background flex h-full flex-col gap-3 rounded-3xl border p-5">
      <header className="flex items-start gap-3">
        <Avatar review={review} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate leading-snug font-bold">{review.authorName}</h3>
          {review.authorDetail && (
            <p className="text-muted-foreground truncate text-xs">{review.authorDetail}</p>
          )}
        </div>
        <GoogleIcon aria-label="Reseña de Google" role="img" className="size-5 shrink-0" />
      </header>
      <div className="flex items-center gap-2">
        <Stars rating={review.rating} />
        <time dateTime={review.reviewedAt} className="text-muted-foreground text-xs">
          {reviewAge(review.reviewedAt, now)}
        </time>
      </div>
      <ReviewText text={review.text} />
      {review.reviewUrl && (
        <a
          href={review.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-auto inline-flex items-center gap-1 self-start pt-1 text-xs font-bold link-underline"
        >
          Ver en Google
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      )}
    </article>
  );
}

interface GoogleReviewsSectionProps {
  readonly reviews: readonly GoogleReviewCard[];
  /** Ficha de Norde en Google Maps. Sin ella, no hay "Ver todas en Google". */
  readonly googleReviewsUrl: string | null;
  readonly now: Date;
}

/** Reseñas de Google elegidas por Norde, con el formato de tarjeta de Google. */
export function GoogleReviewsSection({
  reviews,
  googleReviewsUrl,
  now,
}: GoogleReviewsSectionProps) {
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="reviews-title">
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            id="reviews-title"
            title="Lo que dicen"
            accent="de nosotros"
            description={
              <span className="inline-flex items-center gap-2">
                <GoogleIcon aria-hidden className="size-4" />
                Reseñas de nuestros clientes en Google
              </span>
            }
          />
          {googleReviewsUrl && (
            <a
              href={googleReviewsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 text-sm font-bold link-underline"
            >
              Ver todas en Google
              <ArrowUpRight aria-hidden className="size-4" />
            </a>
          )}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {reviews.map((review, index) => (
            <Reveal as="li" key={review.id} delayMs={(index % 3) * 80} className="h-full">
              <ReviewCard review={review} now={now} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
