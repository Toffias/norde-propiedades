import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields';
import {
  BlockquoteFeature,
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical';
import type { CollectionConfig, FieldHook } from 'payload';

import { RESERVED_POST_SLUGS, routes } from '../../lib/seo/routes';
import type { Post } from '../../payload-types';
import { authenticated, authenticatedOrPublished } from '../access';
import { spanishSlugField } from '../fields/spanish-slug-field';
import { revalidateOnDelete, revalidatePublished } from '../hooks/revalidate-blog';

/** Ruta de preview: habilita el draft mode (solo con sesión del admin) y redirige al post. */
function previewPath(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug === '') return null;
  return `/next/preview?${new URLSearchParams({ path: routes.post(slug) }).toString()}`;
}

/** Al publicar sin fecha, la fecha de publicación es la actual. */
const setPublishedAt: FieldHook<Post, string | null | undefined, Partial<Post>> = ({
  siblingData,
  value,
}) => (siblingData._status === 'published' && !value ? new Date().toISOString() : value);

/**
 * Editor de los artículos. Sin H1 (el título del post es el único H1 de la página) y con
 * links internos a otros posts. Las imágenes se suben a `media` (con texto alternativo).
 */
const postEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    StrikethroughFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    LinkFeature({ enabledCollections: ['posts'] }),
    UploadFeature({ enabledCollections: ['media'] }),
    HorizontalRuleFeature(),
    EXPERIMENTAL_TableFeature(),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
});

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  labels: { singular: 'Artículo', plural: 'Artículos' },
  access: {
    read: authenticatedOrPublished,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  // Lo que se trae cuando otro documento referencia un post (ej. "artículos relacionados").
  defaultPopulate: {
    title: true,
    slug: true,
    heroImage: true,
    publishedAt: true,
    categories: true,
    meta: { description: true },
  },
  admin: {
    group: 'Blog',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status', 'publishedAt', 'updatedAt'],
    description:
      'Artículos del blog. Guía editorial: respuesta directa en el primer párrafo, datos concretos con fecha, foto y autor reales, y preguntas frecuentes al final.',
    livePreview: { url: ({ data }) => previewPath(data.slug) },
    preview: (data) => previewPath(data.slug),
  },
  fields: [
    { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 120 },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Contenido',
          fields: [
            {
              name: 'heroImage',
              label: 'Foto de portada',
              type: 'upload',
              relationTo: 'media',
              required: true,
              admin: { description: 'Foto real (no de banco de imágenes si se puede evitar).' },
            },
            {
              name: 'content',
              label: 'Contenido',
              type: 'richText',
              editor: postEditor,
              required: true,
              admin: {
                description:
                  'Empezá con la respuesta directa. Usá títulos H2 y H3 (el H1 es el título del artículo).',
              },
            },
          ],
        },
        {
          label: 'Preguntas frecuentes',
          description:
            'Se muestran al final del artículo y se publican como FAQPage (resultados enriquecidos y buscadores de IA).',
          fields: [
            {
              name: 'faq',
              label: 'Preguntas',
              labels: { singular: 'Pregunta', plural: 'Preguntas' },
              type: 'array',
              maxRows: 10,
              fields: [
                { name: 'question', label: 'Pregunta', type: 'text', required: true },
                { name: 'answer', label: 'Respuesta', type: 'textarea', required: true },
              ],
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaDescriptionField({
              hasGenerateFn: true,
              overrides: {
                admin: {
                  description:
                    'También se usa como resumen en los listados. Si queda vacía se toma el comienzo del artículo.',
                },
              },
            }),
            MetaImageField({
              relationTo: 'media',
              hasGenerateFn: true,
              overrides: {
                admin: { description: 'Si queda vacía se usa la foto de portada.' },
              },
            }),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      label: 'Fecha de publicación',
      type: 'date',
      index: true,
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
      hooks: { beforeChange: [setPublishedAt] },
    },
    {
      name: 'authors',
      label: 'Autores',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      minRows: 1,
      admin: {
        position: 'sidebar',
        description: 'Personas reales del equipo (señal de confianza para buscadores).',
      },
    },
    {
      name: 'categories',
      label: 'Categorías',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'relatedPosts',
      label: 'Artículos relacionados',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      maxRows: 3,
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
      admin: { position: 'sidebar' },
    },
    spanishSlugField({ reserved: RESERVED_POST_SLUGS }),
  ],
  hooks: {
    afterChange: [revalidatePublished],
    afterDelete: [revalidateOnDelete],
  },
  versions: {
    drafts: {
      autosave: { interval: 375 },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
};
