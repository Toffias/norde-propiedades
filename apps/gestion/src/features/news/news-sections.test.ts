import { NEWS_KIND_VALUES } from '@norde/core/audit/contracts';
import { describe, expect, it } from 'vitest';

import { NEWS_SECTIONS, newsPeriodHref, newsSectionsFor, parseNewsPeriod } from './news-sections';

describe('news sections', () => {
  it('has one section per kind of news', () => {
    expect(NEWS_SECTIONS.map((section) => section.kind).sort()).toEqual(
      [...NEWS_KIND_VALUES].sort(),
    );
  });

  it('keeps the digest order for the chosen kinds', () => {
    expect(
      newsSectionsFor(['client.deleted', 'property.created']).map((section) => section.kind),
    ).toEqual(['property.created', 'client.deleted']);
  });
});

describe('news period param', () => {
  it('reads the period from the URL, today by default', () => {
    expect(parseNewsPeriod(undefined)).toBe('today');
    expect(parseNewsPeriod('ayer')).toBe('yesterday');
    expect(parseNewsPeriod('semana')).toBe('week');
    expect(parseNewsPeriod('mes')).toBe('today');
    expect(parseNewsPeriod(['ayer', 'semana'])).toBe('today');
  });

  it('links today without a param', () => {
    expect(newsPeriodHref('today')).toBe('/noticias');
    expect(newsPeriodHref('week')).toBe('/noticias?periodo=semana');
  });
});
