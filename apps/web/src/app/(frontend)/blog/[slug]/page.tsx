import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { AuthorBio } from '../../../../components/blog/author-bio';
import { FaqSection } from '../../../../components/blog/faq-section';
import { LivePreviewListener } from '../../../../components/blog/live-preview-listener';
import { MediaImage } from '../../../../components/blog/media-image';
import { PostCard } from '../../../../components/blog/post-card';
import { RichText } from '../../../../components/blog/rich-text';
import { Breadcrumbs } from '../../../../components/seo/breadcrumbs';
import { JsonLdScript } from '../../../../components/seo/json-ld-script';
import { BLOG_COPY } from '../../../../lib/blog/copy';
import { mediaAbsoluteUrl, ogImageFromMedia } from '../../../../lib/blog/media';
import {
  findAuthors,
  findPostBySlug,
  findRedirect,
  type PostCardData,
} from '../../../../lib/blog/queries';
import { redirectDestination } from '../../../../lib/blog/redirects';
import { readingTimeMinutes, summarize } from '../../../../lib/blog/text';
import { formatDate, joinNames } from '../../../../lib/format';
import { blogPostingSchema } from '../../../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../../../lib/seo/metadata';
import { routes } from '../../../../lib/seo/routes';
import { getSiteUrl } from '../../../../lib/site-url';
import { nonEmpty } from '../../../../lib/strings';
import type { Category, Media, Post } from '../../../../payload-types';

// ISR on-demand: cada post se genera en su primera visita (el build corre sin base) y queda
// cacheado hasta que se edita algo del blog (tag del blog, invalidado por los hooks).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = PageProps<'/blog/[slug]'>;

const isObject = <T extends object>(value: number | T | null | undefined): value is T =>
  typeof value === 'object' && value !== null;

function relatedCards(post: Post): PostCardData[] {
  return (post.relatedPosts ?? []).filter(isObject).map((related) => ({
    id: related.id,
    title: related.title,
    slug: related.slug,
    publishedAt: related.publishedAt ?? null,
    description: related.meta?.description ?? null,
    heroImage: isObject(related.heroImage) ? related.heroImage : null,
    categories: (related.categories ?? []).filter(isObject),
  }));
}

function descriptionOf(post: Post): string {
  return (
    nonEmpty(post.meta?.description) ?? summarize(convertLexicalToPlaintext({ data: post.content }))
  );
}

async function loadPost(slug: string) {
  const { isEnabled: draft } = await draftMode();
  const post = await findPostBySlug(slug, draft);
  return { post, draft };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const { post, draft } = await loadPost(slug);
  if (!post) return {};

  const image = isObject(post.meta?.image)
    ? post.meta.image
    : isObject(post.heroImage)
      ? post.heroImage
      : null;
  const authors = await findAuthors(post.authors.map((a) => (isObject(a) ? a.id : a)));

  return buildMetadata({
    title: nonEmpty(post.meta?.title) ?? withBrand(post.title),
    description: descriptionOf(post),
    path: routes.post(post.slug),
    image: ogImageFromMedia(image, getSiteUrl()),
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: authors.map((a) => a.name),
    noIndex: draft,
  });
}

export default async function PostPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);
  const { post, draft } = await loadPost(slug);

  if (!post) {
    const redirect = await findRedirect(routes.post(slug));
    const destination = redirect ? redirectDestination(redirect) : null;
    if (destination) permanentRedirect(destination);
    notFound();
  }

  const siteUrl = getSiteUrl();
  const authors = await findAuthors(post.authors.map((a) => (isObject(a) ? a.id : a)));
  const categories: Category[] = (post.categories ?? []).filter(isObject);
  const heroImage: Media | null = isObject(post.heroImage) ? post.heroImage : null;
  const plainText = convertLexicalToPlaintext({ data: post.content });
  const faq = (post.faq ?? []).map(({ question, answer }) => ({ question, answer }));
  const related = relatedCards(post);
  const mainCategory = categories[0];
  const wasUpdated =
    post.publishedAt !== null &&
    post.publishedAt !== undefined &&
    new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 86_400_000;

  const schema = blogPostingSchema(siteUrl, {
    title: post.title,
    path: routes.post(post.slug),
    description: descriptionOf(post),
    imageUrl: mediaAbsoluteUrl(heroImage, siteUrl),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    authors: authors.map((a) => ({
      name: a.name,
      jobTitle: a.role,
      description: a.bio,
      imageUrl: mediaAbsoluteUrl(a.photo, siteUrl),
    })),
    categories: categories.map((c) => c.title),
  });

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <JsonLdScript data={schema} />
      {draft && (
        <div className="bg-accent text-accent-foreground mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
          <span>Estás viendo la vista previa (incluye cambios sin publicar).</span>
          <a
            href={`/next/exit-preview?${new URLSearchParams({ path: routes.post(post.slug) }).toString()}`}
            className="font-medium underline"
          >
            Salir de la vista previa
          </a>
          <LivePreviewListener serverURL={siteUrl} />
        </div>
      )}

      <Breadcrumbs
        items={[
          { name: BLOG_COPY.home, path: routes.home() },
          { name: BLOG_COPY.title, path: routes.blog() },
          ...(mainCategory
            ? [{ name: mainCategory.title, path: routes.category(mainCategory.slug) }]
            : []),
          { name: post.title, path: routes.post(post.slug) },
        ]}
      />

      <header className="mt-6 space-y-4">
        {mainCategory && (
          <Link
            href={routes.category(mainCategory.slug)}
            className="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            {mainCategory.title}
          </Link>
        )}
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {post.title}
        </h1>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {authors.length > 0 && <span>Por {joinNames(authors.map((a) => a.name))}</span>}
          {post.publishedAt && (
            <span>
              Publicado el <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            </span>
          )}
          {wasUpdated && (
            <span>
              Actualizado el <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
            </span>
          )}
          <span>{readingTimeMinutes(plainText)} min de lectura</span>
        </div>
      </header>

      {heroImage && (
        <div className="bg-muted mt-8 aspect-[16/9] overflow-hidden rounded-xl">
          <MediaImage
            media={heroImage}
            sizes="(min-width: 768px) 720px, 100vw"
            className="size-full"
            priority
          />
        </div>
      )}

      <RichText data={post.content} className="mt-10" />

      <FaqSection entries={faq} />
      <AuthorBio authors={authors} />

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-16">
          <h2 id="related-title" className="mb-6 text-2xl font-semibold tracking-tight">
            Seguí leyendo
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {related.map((item) => (
              <PostCard key={item.id} post={item} headingLevel="h3" />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
