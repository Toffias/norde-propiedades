import { describe, expect, it } from 'vitest';

import type { AboutPage, Media } from '../../payload-types';
import { DEFAULT_ABOUT_INTRO, formatStat, toAboutContent, toTeamMemberCard } from './about-content';

const photo: Media = {
  id: 7,
  alt: 'Foto de Ana',
  updatedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('toAboutContent', () => {
  it('uses the default intro and no sections when Norde has not loaded anything', () => {
    expect(toAboutContent(null)).toEqual({
      intro: DEFAULT_ABOUT_INTRO,
      milestones: [],
      stats: [],
    });
  });

  it('keeps the milestones in order and drops unpopulated images', () => {
    const page: AboutPage = {
      id: 1,
      intro: '  Somos de Mataderos.  ',
      milestones: [
        { id: 'a', label: '2012', title: ' Abrimos ', text: 'Texto', image: 3 },
        { id: 'b', label: 'Hoy', title: 'Equipo', text: 'Texto', image: photo },
      ],
      stats: [{ id: 's', value: 1200, prefix: '+', suffix: null, label: 'operaciones' }],
    };

    const content = toAboutContent(page);

    expect(content.intro).toBe('Somos de Mataderos.');
    expect(content.milestones.map((m) => [m.label, m.title, m.image])).toEqual([
      ['2012', 'Abrimos', null],
      ['Hoy', 'Equipo', photo],
    ]);
    expect(content.stats).toEqual([
      { id: 's', value: 1200, prefix: '+', suffix: '', label: 'operaciones' },
    ]);
  });
});

describe('toTeamMemberCard', () => {
  const member = {
    id: 1,
    name: 'Ana Pérez',
    role: 'Asesora comercial',
    area: ' ',
    license: 'CUCICBA 1234',
    photo,
    whatsapp: null,
  };

  it('falls back to the agency WhatsApp when the member has none', () => {
    expect(toTeamMemberCard(member, '5491100000000')).toMatchObject({
      area: null,
      license: 'CUCICBA 1234',
      photo,
      whatsapp: '5491100000000',
    });
  });

  it('prefers the member WhatsApp', () => {
    expect(
      toTeamMemberCard({ ...member, whatsapp: '5491122223333' }, '5491100000000').whatsapp,
    ).toBe('5491122223333');
  });
});

describe('formatStat', () => {
  it('formats with the Argentine thousands separator and the prefix and suffix', () => {
    expect(formatStat({ value: 1200, prefix: '+', suffix: '' })).toBe('+1.200');
    expect(formatStat({ value: 98, prefix: '', suffix: '%' })).toBe('98%');
  });
});
