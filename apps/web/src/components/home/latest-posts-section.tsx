import type { PostCardData } from '../../lib/blog/queries';
import { routes } from '../../lib/seo/routes';
import { PostCard } from '../blog/post-card';
import { SectionHeading } from '../layout/section-heading';

/** Últimos artículos del blog. No se muestra hasta que haya posts publicados. */
export function LatestPostsSection({ posts }: { readonly posts: readonly PostCardData[] }) {
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="latest-posts-title" className="mx-auto max-w-7xl px-4 sm:px-6">
      <SectionHeading
        id="latest-posts-title"
        title="Guías y novedades"
        description="Todo lo que conviene saber antes de comprar, vender o alquilar."
        link={{ href: routes.blog(), label: 'Ver todos los artículos' }}
      />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} headingLevel="h3" />
        ))}
      </div>
    </section>
  );
}
