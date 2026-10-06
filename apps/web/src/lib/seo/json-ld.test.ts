import { aPropertyDetail } from '../properties/test-fixtures';
import { toListingDetail } from '../properties/view';
import { describe, expect, it } from 'vitest';

import { BUSINESS, type Business } from '../../constants/business';
import {
  blogPostingSchema,
  breadcrumbSchema,
  faqSchema,
  organizationSchema,
  serializeJsonLd,
  websiteSchema,
  realEstateListingSchema,
} from './json-ld';

const SITE = 'https://norde.com.ar';

describe('organizationSchema', () => {
  it('declares a RealEstateAgent with a stable @id', () => {
    const schema = organizationSchema(SITE);
    expect(schema).toMatchObject({
      '@type': 'RealEstateAgent',
      '@id': 'https://norde.com.ar/#organization',
      name: BUSINESS.name,
      url: 'https://norde.com.ar/',
    });
  });

  it('omits the contact data that is not confirmed', () => {
    const unknown: Business = {
      ...BUSINESS,
      email: null,
      telephone: null,
      address: null,
      geo: null,
    };
    const schema = organizationSchema(SITE, unknown);
    expect(schema).not.toHaveProperty('telephone');
    expect(schema).not.toHaveProperty('email');
    expect(schema).not.toHaveProperty('address');
    expect(schema).not.toHaveProperty('geo');
    expect(schema).not.toHaveProperty('sameAs');
  });

  it('publishes the address, coordinates, hours, zones and profiles when they exist', () => {
    const complete: Business = {
      ...BUSINESS,
      telephone: '+5491100000000',
      address: {
        streetAddress: 'Av. Siempre Viva 123',
        addressLocality: 'Palermo',
        addressRegion: 'CABA',
        postalCode: null,
        addressCountry: 'AR',
      },
      geo: { latitude: -34.58, longitude: -58.42 },
      openingHours: ['Mo-Fr 09:00-18:00'],
      areaServed: ['Palermo'],
      sameAs: ['https://www.instagram.com/norde'],
    };
    const schema = organizationSchema(SITE, complete);
    expect(schema).toMatchObject({
      telephone: '+5491100000000',
      address: { '@type': 'PostalAddress', streetAddress: 'Av. Siempre Viva 123' },
      geo: { '@type': 'GeoCoordinates', latitude: -34.58 },
      openingHours: ['Mo-Fr 09:00-18:00'],
      areaServed: [{ '@type': 'Place', name: 'Palermo' }],
      sameAs: ['https://www.instagram.com/norde'],
    });
    expect(schema.address).not.toHaveProperty('postalCode');
  });
});

describe('websiteSchema', () => {
  it('points to the organization as publisher', () => {
    expect(websiteSchema(SITE)).toMatchObject({
      '@type': 'WebSite',
      publisher: { '@id': 'https://norde.com.ar/#organization' },
    });
  });
});

describe('breadcrumbSchema', () => {
  it('numbers the items and uses absolute URLs', () => {
    const schema = breadcrumbSchema(SITE, [
      { name: 'Inicio', path: '/' },
      { name: 'Blog', path: '/blog' },
    ]);
    expect(schema.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://norde.com.ar/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://norde.com.ar/blog' },
    ]);
  });
});

describe('blogPostingSchema', () => {
  it('describes the post with its authors as Person', () => {
    const schema = blogPostingSchema(SITE, {
      title: 'Cómo se calcula el aumento por IPC',
      path: '/blog/aumento-ipc',
      description: 'Paso a paso.',
      imageUrl: 'https://norde.com.ar/api/media/file/ipc.webp',
      datePublished: '2026-09-01T12:00:00.000Z',
      dateModified: null,
      authors: [{ name: 'Ana Pérez', jobTitle: 'Corredora matriculada', description: ' ' }],
      categories: ['Alquilar'],
    });

    expect(schema).toMatchObject({
      '@type': 'BlogPosting',
      '@id': 'https://norde.com.ar/blog/aumento-ipc#article',
      headline: 'Cómo se calcula el aumento por IPC',
      datePublished: '2026-09-01T12:00:00.000Z',
      dateModified: '2026-09-01T12:00:00.000Z',
      articleSection: ['Alquilar'],
      publisher: { '@id': 'https://norde.com.ar/#organization' },
      author: [
        {
          '@type': 'Person',
          name: 'Ana Pérez',
          jobTitle: 'Corredora matriculada',
          worksFor: { '@id': 'https://norde.com.ar/#organization' },
        },
      ],
    });
    expect((schema.author as unknown[])[0]).not.toHaveProperty('description');
  });

  it('omits the author when there is none', () => {
    const schema = blogPostingSchema(SITE, { title: 'X', path: '/blog/x', authors: [] });
    expect(schema).not.toHaveProperty('author');
    expect(schema).not.toHaveProperty('dateModified');
  });
});

describe('faqSchema', () => {
  it('keeps only complete questions', () => {
    const schema = faqSchema([
      { question: '¿Cada cuánto se ajusta?', answer: 'Según el contrato.' },
      { question: '  ', answer: 'Sin pregunta' },
    ]);
    expect(schema?.mainEntity).toEqual([
      {
        '@type': 'Question',
        name: '¿Cada cuánto se ajusta?',
        acceptedAnswer: { '@type': 'Answer', text: 'Según el contrato.' },
      },
    ]);
  });

  it('returns undefined without questions', () => {
    expect(faqSchema([])).toBeUndefined();
  });
});

describe('serializeJsonLd', () => {
  it('escapes < so the CMS content cannot close the script tag', () => {
    const json = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ headline: '</script><script>alert(1)</script>' });
  });
});

describe('realEstateListingSchema', () => {
  const SITE = 'https://norde.example';

  it('describes the listing, its offer and the place, with absolute photo URLs', () => {
    const schema = realEstateListingSchema(SITE, toListingDetail(aPropertyDetail()));
    expect(schema).toMatchObject({
      '@type': 'RealEstateListing',
      url: `${SITE}/propiedades/departamento-3-ambientes-mataderos-dep0001`,
      name: 'Departamento 3 ambientes con balcón',
      image: [`${SITE}/fotos/m1/abc`, `${SITE}/fotos/m2/abc`],
      offers: { '@type': 'Offer', price: 98_000, priceCurrency: 'USD' },
      about: {
        '@type': 'Apartment',
        address: { addressLocality: 'Mataderos, CABA', addressCountry: 'AR' },
        floorSize: { value: 72, unitCode: 'MTK' },
        numberOfRooms: 3,
      },
    });
  });

  it('leaves out a hidden price and approximate coordinates', () => {
    const schema = realEstateListingSchema(
      SITE,
      toListingDetail(
        aPropertyDetail({
          price: null,
          coordinates: { latitude: -34.65, longitude: -58.5, exact: false },
        }),
      ),
    );
    expect(schema.offers).not.toHaveProperty('price');
    expect(schema.about).not.toHaveProperty('geo');
  });
});
