import { describe, expect, it } from 'vitest';

import {
  authorInitial,
  avatarColor,
  reviewAge,
  toGoogleReviewCard,
  type GoogleReviewDoc,
} from './google-reviews';

const NOW = new Date('2026-11-04T15:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('reviewAge', () => {
  it.each([
    [0, 'hoy'],
    [1, 'ayer'],
    [4, 'hace 4 días'],
    [7, 'hace una semana'],
    [20, 'hace 2 semanas'],
    [30, 'hace un mes'],
    [95, 'hace 3 meses'],
    [365, 'hace un año'],
    [800, 'hace 2 años'],
  ])('%i días → %s', (days, expected) => {
    expect(reviewAge(daysAgo(days), NOW)).toBe(expected);
  });

  it('una fecha futura se muestra como hoy', () => {
    expect(reviewAge(daysAgo(-3), NOW)).toBe('hoy');
  });
});

describe('authorInitial', () => {
  it('usa la primera letra en mayúscula', () => {
    expect(authorInitial('  ángela ruiz')).toBe('Á');
  });

  it('sin nombre devuelve un signo', () => {
    expect(authorInitial('   ')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('es estable para el mismo nombre', () => {
    expect(avatarColor('Juan Pérez')).toBe(avatarColor('Juan Pérez'));
    expect(avatarColor('Juan Pérez')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('toGoogleReviewCard', () => {
  const doc: GoogleReviewDoc = {
    id: 1,
    authorName: ' Juan Pérez ',
    authorPhoto: 7,
    authorDetail: '  ',
    rating: 7,
    text: ' Excelente atención. ',
    reviewedAt: '2026-05-01T00:00:00.000Z',
    reviewUrl: '',
  };

  it('limpia los textos, acota las estrellas y descarta la foto sin poblar', () => {
    expect(toGoogleReviewCard(doc)).toEqual({
      id: 1,
      authorName: 'Juan Pérez',
      authorPhoto: null,
      authorDetail: null,
      rating: 5,
      text: 'Excelente atención.',
      reviewedAt: '2026-05-01T00:00:00.000Z',
      reviewUrl: null,
    });
  });

  it('una estrella como mínimo', () => {
    expect(toGoogleReviewCard({ ...doc, rating: 0 }).rating).toBe(1);
  });
});
