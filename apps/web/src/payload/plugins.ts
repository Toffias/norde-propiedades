import { redirectsPlugin } from '@payloadcms/plugin-redirects';
import { seoPlugin } from '@payloadcms/plugin-seo';
import type {
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
  GenerateURL,
} from '@payloadcms/plugin-seo/types';
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext';
import type { Plugin } from 'payload';

import { summarize } from '../lib/blog/text';
import { withBrand } from '../lib/seo/metadata';
import { absoluteUrl, routes } from '../lib/seo/routes';
import type { Post } from '../payload-types';
import { authenticated } from './access';
import { revalidateOnChange, revalidateOnDelete } from './hooks/revalidate-blog';

/** Documento en edición: cualquier campo puede faltar o venir en `null`. */
type PostDraft = { [K in keyof Post]?: Post[K] | null };

// Los botones "Generar" del tab SEO de los posts.
const generateTitle: GenerateTitle<PostDraft> = ({ doc }) => withBrand(doc.title);

const generateDescription: GenerateDescription<PostDraft> = ({ doc }) =>
  doc.content ? summarize(convertLexicalToPlaintext({ data: doc.content })) : '';

const generateImage: GenerateImage<PostDraft> = ({ doc }) => {
  const hero = doc.heroImage;
  if (hero === undefined || hero === null) return '';
  return typeof hero === 'object' ? hero.id : hero;
};

// Corrige el bug de DS-DESIGN-Landing: la URL real del post es /blog/<slug>.
const generateURL: GenerateURL<PostDraft> = ({ doc, req }) =>
  absoluteUrl(req.payload.config.serverURL, doc.slug ? routes.post(doc.slug) : routes.blog());

export const plugins: Plugin[] = [
  seoPlugin({ generateTitle, generateDescription, generateImage, generateURL }),
  redirectsPlugin({
    collections: ['posts'],
    overrides: {
      labels: { singular: 'Redirección', plural: 'Redirecciones' },
      access: {
        read: () => true,
        create: authenticated,
        update: authenticated,
        delete: authenticated,
      },
      admin: {
        group: 'Configuración',
        description:
          'Redirecciones 301 para URLs que cambiaron (ej. un slug editado o URLs del sitio anterior).',
      },
      hooks: { afterChange: [revalidateOnChange], afterDelete: [revalidateOnDelete] },
    },
  }),
];
