// Datos estructurados schema.org (JSON-LD) para buscadores y motores de IA.
// Funciones puras: reciben la URL del sitio y devuelven el objeto listo para serializar.

import { BUSINESS, type Business } from '../../constants/business';
import { absoluteUrl, routes } from './routes';

export type JsonLd = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

export const organizationId = (siteUrl: string) => `${absoluteUrl(siteUrl, '/')}#organization`;
export const websiteId = (siteUrl: string) => `${absoluteUrl(siteUrl, '/')}#website`;

/** `RealEstateAgent` sitewide. Los datos que Norde no confirmó (en `null`) se omiten. */
export function organizationSchema(siteUrl: string, business: Business = BUSINESS): JsonLd {
  const schema: JsonLd = {
    '@context': CONTEXT,
    '@type': 'RealEstateAgent',
    '@id': organizationId(siteUrl),
    name: business.name,
    legalName: business.legalName,
    description: business.description,
    url: absoluteUrl(siteUrl, '/'),
    image: absoluteUrl(siteUrl, routes.defaultOgImage()),
  };
  if (business.email) schema.email = business.email;
  if (business.telephone) schema.telephone = business.telephone;
  if (business.address) {
    const { streetAddress, postalCode, ...rest } = business.address;
    schema.address = {
      '@type': 'PostalAddress',
      ...rest,
      ...(streetAddress ? { streetAddress } : {}),
      ...(postalCode ? { postalCode } : {}),
    };
  }
  if (business.geo) {
    schema.geo = { '@type': 'GeoCoordinates', ...business.geo };
  }
  if (business.openingHours.length > 0) schema.openingHours = [...business.openingHours];
  if (business.areaServed.length > 0) {
    schema.areaServed = business.areaServed.map((name) => ({ '@type': 'Place', name }));
  }
  if (business.sameAs.length > 0) schema.sameAs = [...business.sameAs];
  return schema;
}

export function websiteSchema(siteUrl: string, business: Business = BUSINESS): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': websiteId(siteUrl),
    name: business.name,
    url: absoluteUrl(siteUrl, '/'),
    inLanguage: 'es-AR',
    publisher: { '@id': organizationId(siteUrl) },
  };
}

export interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

export function breadcrumbSchema(siteUrl: string, items: readonly BreadcrumbItem[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(siteUrl, item.path),
    })),
  };
}

export interface ArticleAuthor {
  readonly name: string;
  readonly jobTitle?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly imageUrl?: string | null | undefined;
}

export interface BlogPostingInput {
  readonly title: string;
  readonly path: string;
  readonly description?: string | null | undefined;
  readonly imageUrl?: string | null | undefined;
  readonly datePublished?: string | null | undefined;
  readonly dateModified?: string | null | undefined;
  readonly authors: readonly ArticleAuthor[];
  readonly categories?: readonly string[] | undefined;
}

/** `BlogPosting` con autores `Person` (señal E-E-A-T) y la organización como publisher. */
export function blogPostingSchema(siteUrl: string, input: BlogPostingInput): JsonLd {
  const url = absoluteUrl(siteUrl, input.path);
  const schema: JsonLd = {
    '@context': CONTEXT,
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: input.title,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'es-AR',
    publisher: { '@id': organizationId(siteUrl) },
    isPartOf: { '@id': websiteId(siteUrl) },
  };
  const description = input.description?.trim();
  if (description) schema.description = description;
  if (input.imageUrl) schema.image = input.imageUrl;
  if (input.datePublished) schema.datePublished = input.datePublished;
  const modified = input.dateModified ?? input.datePublished;
  if (modified) schema.dateModified = modified;
  if (input.categories && input.categories.length > 0) {
    schema.articleSection = [...input.categories];
  }

  const authors = input.authors.filter((a) => a.name.trim() !== '');
  if (authors.length > 0) {
    schema.author = authors.map((a) => {
      const person: JsonLd = {
        '@type': 'Person',
        name: a.name.trim(),
        worksFor: { '@id': organizationId(siteUrl) },
      };
      if (a.jobTitle?.trim()) person.jobTitle = a.jobTitle.trim();
      if (a.description?.trim()) person.description = a.description.trim();
      if (a.imageUrl) person.image = a.imageUrl;
      return person;
    });
  }
  return schema;
}

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/** `FAQPage`. Devuelve `undefined` si no hay preguntas completas. */
export function faqSchema(entries: readonly FaqEntry[]): JsonLd | undefined {
  const valid = entries
    .map((e) => ({ question: e.question.trim(), answer: e.answer.trim() }))
    .filter((e) => e.question !== '' && e.answer !== '');
  if (valid.length === 0) return undefined;

  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: valid.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: { '@type': 'Answer', text: e.answer },
    })),
  };
}

/**
 * Serializa para un `<script type="application/ld+json">`. Escapa `<` para que un texto
 * cargado en el CMS no pueda cerrar el script (XSS).
 */
export function serializeJsonLd(data: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
