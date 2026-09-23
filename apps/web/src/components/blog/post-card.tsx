import Link from 'next/link';

import type { PostCardData } from '../../lib/blog/queries';
import { formatDate } from '../../lib/format';
import { routes } from '../../lib/seo/routes';
import { MediaImage } from './media-image';

interface PostCardProps {
  readonly post: PostCardData;
  /** H2 en los listados; H3 dentro de una sección que ya tiene su H2 (ej. la home). */
  readonly headingLevel?: 'h2' | 'h3';
  readonly priority?: boolean;
}

export function PostCard({ post, headingLevel = 'h2', priority = false }: PostCardProps) {
  const Heading = headingLevel;
  const category = post.categories[0];

  return (
    <article className="group bg-card text-card-foreground relative flex flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-md">
      <div className="bg-muted aspect-[16/10] overflow-hidden">
        {post.heroImage && (
          <MediaImage
            media={post.heroImage}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="size-full transition-transform duration-300 group-hover:scale-[1.02]"
            priority={priority}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          {category && <span className="text-foreground font-medium">{category.title}</span>}
          {post.publishedAt && (
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          )}
        </div>
        <Heading className="text-lg leading-snug font-semibold text-balance">
          {/* El link cubre toda la tarjeta con un pseudo-elemento. */}
          <Link href={routes.post(post.slug)} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </Heading>
        {post.description && (
          <p className="text-muted-foreground line-clamp-3 text-sm">{post.description}</p>
        )}
      </div>
    </article>
  );
}
