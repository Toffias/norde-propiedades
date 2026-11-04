import type { GoogleReview, Media } from '../../payload-types';

// Reseñas de Google cargadas a mano en Payload, como las muestra la página. Funciones puras: la
// lectura cacheada está en `queries.ts`.

export interface GoogleReviewCard {
  readonly id: number;
  readonly authorName: string;
  readonly authorPhoto: Media | null;
  readonly authorDetail: string | null;
  /** Entero de 1 a 5. */
  readonly rating: number;
  readonly text: string;
  /** ISO 8601. */
  readonly reviewedAt: string;
  readonly reviewUrl: string | null;
}

export type GoogleReviewDoc = Pick<
  GoogleReview,
  | 'id'
  | 'authorName'
  | 'authorPhoto'
  | 'authorDetail'
  | 'rating'
  | 'text'
  | 'reviewedAt'
  | 'reviewUrl'
>;

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
};

const clampRating = (value: number): number => Math.min(5, Math.max(1, Math.round(value)));

export function toGoogleReviewCard(review: GoogleReviewDoc): GoogleReviewCard {
  return {
    id: review.id,
    authorName: review.authorName.trim(),
    authorPhoto:
      review.authorPhoto !== null && typeof review.authorPhoto === 'object'
        ? review.authorPhoto
        : null,
    authorDetail: clean(review.authorDetail),
    rating: clampRating(review.rating),
    text: review.text.trim(),
    reviewedAt: review.reviewedAt,
    reviewUrl: clean(review.reviewUrl),
  };
}

/** La inicial del avatar sin foto, como en Google. */
export function authorInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase('es-AR') : '?';
}

/** Colores de avatar de Google, elegidos de forma estable por nombre. */
const AVATAR_COLORS = [
  '#1a73e8',
  '#d93025',
  '#188038',
  '#e37400',
  '#9334e6',
  '#c5221f',
  '#12b5cb',
  '#5f6368',
] as const;

export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Antigüedad de la reseña como la escribe Google: "hace 3 días", "hace una semana",
 * "hace 2 meses", "hace un año". `now` se recibe para poder probarla.
 */
export function reviewAge(iso: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'hace una semana' : `hace ${weeks} semanas`;
  }
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? 'hace un mes' : `hace ${months} meses`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? 'hace un año' : `hace ${years} años`;
}
