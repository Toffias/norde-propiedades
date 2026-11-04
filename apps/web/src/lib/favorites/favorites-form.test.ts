import { describe, expect, it } from 'vitest';

import { favoriteExternalId } from './external-id';
import {
  FAVORITES_FIELDS as F,
  favoritesInquiryMessage,
  parseFavoritesForm,
} from './favorites-form';
import { MAX_FAVORITES } from './favorites';

const SUBMISSION = '0192f0a0-0000-4000-8000-000000000001';
const P1 = '00000000-0000-7000-8000-0000000000c1';
const P2 = '00000000-0000-7000-8000-0000000000c2';

function form(values: {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly message?: string;
  readonly honeypot?: string;
  readonly propertyIds?: readonly string[];
  readonly submissionId?: string;
}): FormData {
  const data = new FormData();
  data.set(F.name, values.name ?? 'Ana Pérez');
  data.set(F.email, values.email ?? '');
  data.set(F.phone, values.phone ?? '11 6689-9124');
  data.set(F.message, values.message ?? '');
  for (const id of values.propertyIds ?? [P1, P2]) data.append(F.propertyIds, id);
  data.set(F.submissionId, values.submissionId ?? SUBMISSION);
  data.set(F.honeypot, values.honeypot ?? '');
  return data;
}

describe('parseFavoritesForm', () => {
  it('accepts the contact, an optional message and the properties without repeats', () => {
    expect(parseFavoritesForm(form({ propertyIds: [P1, P2, P1.toUpperCase()] }))).toEqual({
      kind: 'valid',
      data: {
        name: 'Ana Pérez',
        email: undefined,
        phone: '11 6689-9124',
        message: undefined,
        propertyIds: [P1, P2],
        submissionId: SUBMISSION,
      },
    });
  });

  it('asks for a phone or an email', () => {
    const parsed = parseFavoritesForm(form({ phone: '', email: '' }));
    expect(parsed).toMatchObject({
      kind: 'invalid',
      state: { fieldErrors: { phone: 'Dejanos un teléfono o un email para responderte.' } },
    });
  });

  it('rejects an empty or oversized favorites list', () => {
    expect(parseFavoritesForm(form({ propertyIds: [] }))).toMatchObject({
      kind: 'invalid',
      state: { message: 'No pudimos leer tus favoritos. Recargá la página y probá de nuevo.' },
    });
    const many = Array.from(
      { length: MAX_FAVORITES + 1 },
      (_, i) => `00000000-0000-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
    );
    expect(parseFavoritesForm(form({ propertyIds: many })).kind).toBe('invalid');
  });

  it('rejects a missing submission id', () => {
    expect(parseFavoritesForm(form({ submissionId: '' })).kind).toBe('invalid');
  });

  it('flags bots by the honeypot', () => {
    expect(parseFavoritesForm(form({ honeypot: 'https://spam.example' }))).toEqual({
      kind: 'bot',
    });
  });
});

describe('favoritesInquiryMessage', () => {
  it('uses the written message or a default, and says it came from favorites', () => {
    expect(favoritesInquiryMessage('Quiero visitarlas', 2)).toBe(
      'Quiero visitarlas\n\nConsulta desde favoritos del sitio (2 propiedades en el mismo envío).',
    );
    expect(favoritesInquiryMessage(undefined, 1)).toContain('guardé en favoritos');
    expect(favoritesInquiryMessage(undefined, 1)).toContain('Consulta desde favoritos del sitio.');
  });
});

describe('favoriteExternalId', () => {
  it('is a stable UUID per submission and property', () => {
    const id = favoriteExternalId(SUBMISSION, P1);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(favoriteExternalId(SUBMISSION.toUpperCase(), P1.toUpperCase())).toBe(id);
    expect(favoriteExternalId(SUBMISSION, P2)).not.toBe(id);
    expect(favoriteExternalId('0192f0a0-0000-4000-8000-000000000002', P1)).not.toBe(id);
  });
});
