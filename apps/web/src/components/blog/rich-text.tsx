import { cn } from '@norde/ui/lib/utils';
import type {
  DefaultNodeTypes,
  SerializedLinkNode,
  SerializedUploadNode,
} from '@payloadcms/richtext-lexical';
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import {
  LinkJSXConverter,
  RichText as LexicalRichText,
  type JSXConvertersFunction,
} from '@payloadcms/richtext-lexical/react';

import { routes } from '../../lib/seo/routes';
import type { Media } from '../../payload-types';
import { MediaImage } from './media-image';

function hasSlug(value: unknown): value is { slug: string } {
  return (
    typeof value === 'object' && value !== null && 'slug' in value && typeof value.slug === 'string'
  );
}

function isMedia(value: unknown): value is Media {
  return typeof value === 'object' && value !== null && 'url' in value && 'alt' in value;
}

/** Links internos del editor (hoy, solo a otros posts). */
function internalDocToHref({ linkNode }: { linkNode: SerializedLinkNode }): string {
  const doc = linkNode.fields.doc;
  if (doc?.relationTo === 'posts' && hasSlug(doc.value)) return routes.post(doc.value.slug);
  return routes.blog();
}

const converters: JSXConvertersFunction<DefaultNodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...LinkJSXConverter({ internalDocToHref }),
  upload: ({ node }: { node: SerializedUploadNode }) => {
    if (!isMedia(node.value)) return null;
    return (
      <figure>
        <MediaImage
          media={node.value}
          sizes="(min-width: 768px) 720px, 100vw"
          className="rounded-lg"
        />
      </figure>
    );
  },
});

interface RichTextProps {
  readonly data: SerializedEditorState;
  readonly className?: string;
}

/** Contenido de Lexical con la tipografía del sitio (`prose`, mapeada a los tokens). */
export function RichText({ data, className }: RichTextProps) {
  return (
    <LexicalRichText
      data={data}
      converters={converters}
      className={cn('prose prose-lg max-w-none', className)}
    />
  );
}
