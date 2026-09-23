import type { Media } from '../../payload-types';
import type { MetaImage } from '../seo/metadata';
import { absoluteUrl } from '../seo/routes';

/** Imagen Open Graph de un documento: el tamaño `og` (1200x630) si existe, o el original. */
export function ogImageFromMedia(media: Media | null, siteUrl: string): MetaImage | null {
  const og = media?.sizes?.og;
  if (og?.url) {
    return {
      url: absoluteUrl(siteUrl, og.url),
      width: og.width ?? undefined,
      height: og.height ?? undefined,
      alt: media?.alt,
    };
  }
  if (!media?.url) return null;
  return {
    url: absoluteUrl(siteUrl, media.url),
    width: media.width ?? undefined,
    height: media.height ?? undefined,
    alt: media.alt,
  };
}

export function mediaAbsoluteUrl(media: Media | null, siteUrl: string): string | null {
  return media?.url ? absoluteUrl(siteUrl, media.url) : null;
}
