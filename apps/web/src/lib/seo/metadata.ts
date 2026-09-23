import type { Metadata } from 'next';

import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { nonEmpty } from '../strings';
import { routes } from './routes';

export interface MetaImage {
  /** Absoluta o relativa al sitio (se resuelve con `metadataBase`). */
  readonly url: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly alt?: string | undefined;
}

export interface PageMetaInput {
  /** Título final (con la marca). Usar `withBrand` para armarlo. */
  readonly title: string;
  readonly description?: string | null | undefined;
  /** Ruta canónica relativa (`/blog/mi-post`). */
  readonly path: string;
  readonly image?: MetaImage | null | undefined;
  readonly type?: 'website' | 'article';
  readonly publishedTime?: string | null | undefined;
  readonly modifiedTime?: string | null | undefined;
  readonly authors?: readonly string[] | undefined;
  /** Páginas que no deben indexarse (ej. borradores en preview). */
  readonly noIndex?: boolean;
}

const DEFAULT_OG_IMAGE: MetaImage = {
  url: routes.defaultOgImage(),
  width: 1200,
  height: 630,
  alt: BUSINESS.name,
};

/** Agrega la marca al título, salvo que ya la tenga (los meta titles del admin suelen incluirla). */
export function withBrand(title: string | null | undefined): string {
  const clean = title?.trim();
  if (!clean) return SITE_TITLE;
  return clean.includes(BUSINESS.name) ? clean : `${clean} | ${BUSINESS.name}`;
}

/** Metadata de una página: title, description, canonical, Open Graph y Twitter card. */
export function buildMetadata(input: PageMetaInput): Metadata {
  const description = nonEmpty(input.description) ?? BUSINESS.description;
  const image = input.image ?? DEFAULT_OG_IMAGE;
  const images = [
    {
      url: image.url,
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {}),
      alt: image.alt ?? input.title,
    },
  ];

  const openGraph: NonNullable<Metadata['openGraph']> =
    input.type === 'article'
      ? {
          type: 'article',
          ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
          ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
          ...(input.authors && input.authors.length > 0 ? { authors: [...input.authors] } : {}),
          title: input.title,
          description,
          url: input.path,
          siteName: BUSINESS.name,
          locale: 'es_AR',
          images,
        }
      : {
          type: 'website',
          title: input.title,
          description,
          url: input.path,
          siteName: BUSINESS.name,
          locale: 'es_AR',
          images,
        };

  return {
    title: { absolute: input.title },
    description,
    alternates: { canonical: input.path },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description,
      images: images.map((i) => i.url),
    },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
