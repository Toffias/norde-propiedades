import { describe, expect, it } from 'vitest';

import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { buildMetadata, withBrand } from './metadata';

describe('withBrand', () => {
  it('appends the brand once', () => {
    expect(withBrand('Blog')).toBe(`Blog | ${BUSINESS.name}`);
    expect(withBrand(`Guía de alquileres | ${BUSINESS.name}`)).toBe(
      `Guía de alquileres | ${BUSINESS.name}`,
    );
  });

  it('falls back to the site title', () => {
    expect(withBrand('  ')).toBe(SITE_TITLE);
    expect(withBrand(undefined)).toBe(SITE_TITLE);
  });
});

describe('buildMetadata', () => {
  it('sets an absolute title, the canonical URL, Open Graph and the Twitter card', () => {
    const meta = buildMetadata({
      title: 'Blog | Norde Propiedades',
      description: 'Guías para comprar y alquilar.',
      path: '/blog',
    });

    expect(meta.title).toEqual({ absolute: 'Blog | Norde Propiedades' });
    expect(meta.description).toBe('Guías para comprar y alquilar.');
    expect(meta.alternates?.canonical).toBe('/blog');
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      url: '/blog',
      locale: 'es_AR',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(meta.robots).toBeUndefined();
  });

  it('describes articles with their dates and authors', () => {
    const meta = buildMetadata({
      title: 'Post',
      path: '/blog/post',
      type: 'article',
      image: { url: '/api/media/file/foto-og.webp', width: 1200, height: 630, alt: 'Frente' },
      publishedTime: '2026-09-01T12:00:00.000Z',
      modifiedTime: '2026-09-10T12:00:00.000Z',
      authors: ['Ana Pérez'],
    });

    expect(meta.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-09-01T12:00:00.000Z',
      modifiedTime: '2026-09-10T12:00:00.000Z',
      authors: ['Ana Pérez'],
      images: [{ url: '/api/media/file/foto-og.webp', alt: 'Frente' }],
    });
  });

  it('uses the business description when the page has none', () => {
    expect(buildMetadata({ title: 'X', path: '/x', description: ' ' }).description).toBe(
      BUSINESS.description,
    );
  });

  it('can mark a page as not indexable', () => {
    expect(buildMetadata({ title: 'X', path: '/x', noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
