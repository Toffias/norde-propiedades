import { cn } from '@norde/ui/lib/utils';
import Link from 'next/link';

import type { PostListPage } from '../../lib/blog/queries';
import type { BreadcrumbItem } from '../../lib/seo/json-ld';
import { routes } from '../../lib/seo/routes';
import type { Category } from '../../payload-types';
import { Breadcrumbs } from '../seo/breadcrumbs';
import { Pagination } from './pagination';
import { PostCard } from './post-card';

interface PostListViewProps {
  readonly title: string;
  readonly intro: string;
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly list: PostListPage;
  readonly page: number;
  readonly hrefForPage: (page: number) => string;
  readonly categories: readonly Category[];
  /** Categoría activa (en su página). */
  readonly activeCategoryId?: number;
}

/** Listado del blog (general o de una categoría), con filtros por categoría y paginación. */
export function PostListView({
  title,
  intro,
  breadcrumbs,
  list,
  page,
  hrefForPage,
  categories,
  activeCategoryId,
}: PostListViewProps) {
  const chip = 'rounded-full border px-3 py-1 text-sm transition-colors';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={breadcrumbs} />
      <header className="mt-6 max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
          {page > 1 && <span className="text-muted-foreground font-normal"> · Página {page}</span>}
        </h1>
        <p className="text-muted-foreground text-lg">{intro}</p>
      </header>

      {categories.length > 0 && (
        <nav aria-label="Categorías del blog" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href={routes.blog()}
                aria-current={activeCategoryId === undefined ? 'page' : undefined}
                className={cn(
                  chip,
                  activeCategoryId === undefined
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent',
                )}
              >
                Todos
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={routes.category(category.slug)}
                  aria-current={activeCategoryId === category.id ? 'page' : undefined}
                  className={cn(
                    chip,
                    activeCategoryId === category.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent',
                  )}
                >
                  {category.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {list.posts.length === 0 ? (
        <p className="text-muted-foreground mt-12">Todavía no hay artículos publicados.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.posts.map((post, index) => (
            <PostCard key={post.id} post={post} priority={page === 1 && index < 3} />
          ))}
        </div>
      )}

      <Pagination current={page} total={list.totalPages} hrefFor={hrefForPage} />
    </div>
  );
}
