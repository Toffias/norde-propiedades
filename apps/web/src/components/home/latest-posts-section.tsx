import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { PostCardData } from '../../lib/blog/queries';
import { routes } from '../../lib/seo/routes';
import { PostCard } from '../blog/post-card';

/** Últimos artículos del blog. No se muestra hasta que haya posts publicados. */
export function LatestPostsSection({ posts }: { readonly posts: readonly PostCardData[] }) {
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="latest-posts-title" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h2 id="latest-posts-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Guías y novedades
          </h2>
          <p className="text-muted-foreground">
            Todo lo que conviene saber antes de comprar, vender o alquilar.
          </p>
        </div>
        <Link
          href={routes.blog()}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          Ver todos los artículos
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} headingLevel="h3" />
        ))}
      </div>
    </section>
  );
}
