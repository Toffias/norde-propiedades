import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { NewspaperIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { getContainer } from '../../../container';
import { NewsKindsFilter } from '../../../features/news/components/news-kinds-filter';
import { NewsPeriodTabs } from '../../../features/news/components/news-period-tabs';
import { NewsSection } from '../../../features/news/components/news-section';
import { NewsSummary } from '../../../features/news/components/news-summary';
import { NEWS_ERROR_MESSAGES } from '../../../features/news/messages';
import { NEWS_KINDS_COOKIE, parseNewsKinds } from '../../../features/news/news-kinds';
import {
  NEWS_SECTION_PAGE_SIZES,
  newsSectionsFor,
  parseNewsPeriod,
} from '../../../features/news/news-sections';
import { messageForError } from '../../../lib/errors';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Noticias' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Noticias como resumen: una frase con lo que pasó en el período (hoy, ayer o la semana) y una
 * sección por tipo de noticia, cada una paginada en el servidor.
 */
export default async function NewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const period = parseNewsPeriod((await searchParams).periodo);
  const kinds = parseNewsKinds((await cookies()).get(NEWS_KINDS_COOKIE)?.value);
  const sections = newsSectionsFor(kinds);
  const { listNews, getNewsActivity } = getContainer().news;
  const [activity, pages] = await Promise.all([
    getNewsActivity.execute({ kinds }, actor),
    Promise.all(
      sections.map((section) =>
        listNews.execute(
          { kinds: [section.kind], period, pageSize: NEWS_SECTION_PAGE_SIZES[section.layout] },
          actor,
        ),
      ),
    ),
  ]);

  const failedPage = pages.find((page) => page.isErr());
  const error = activity.isErr()
    ? activity.error
    : failedPage?.isErr()
      ? failedPage.error
      : undefined;
  if (activity.isErr() || error !== undefined) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          icon={NewspaperIcon}
          title="Noticias"
          subtitle="Lo que pasa en la empresa, día por día"
        />
        <Card className="p-0">
          <DataTableError
            message={
              error === undefined
                ? NEWS_ERROR_MESSAGES.InvalidInput
                : messageForError(error, NEWS_ERROR_MESSAGES)
            }
          />
        </Card>
      </div>
    );
  }

  const today = activity.value.days.at(-1)?.day ?? '';
  const loaded = sections.flatMap((section, index) => {
    const page = pages[index];
    return page?.isOk() ? [{ section, page: page.value }] : [];
  });
  const withNews = loaded.filter(({ page }) => page.total > 0);
  const cards = withNews.filter(({ section }) => section.layout === 'cards');
  const lists = withNews.filter(({ section }) => section.layout === 'list');
  // Al cambiar de período o de tipos, cada sección arranca de nuevo desde la primera tanda.
  const resetKey = `${period}|${kinds.join(',')}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={NewspaperIcon}
        title="Noticias"
        subtitle="Lo que pasa en la empresa, día por día"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewsPeriodTabs selected={period} />
            <NewsKindsFilter selected={kinds} />
          </div>
        }
      />
      {kinds.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <NewspaperIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Elegí al menos un tipo de noticia para ver el resumen.
          </p>
        </div>
      ) : (
        <>
          <NewsSummary
            period={period}
            today={today}
            totals={loaded.map(({ section, page }) => ({ section, total: page.total }))}
            activity={activity.value.days}
          />
          {cards.map(({ section, page }) => (
            <NewsSection
              key={`${section.kind}|${resetKey}`}
              section={section}
              initial={page}
              period={period}
              today={today}
            />
          ))}
          {lists.length > 0 && (
            <div className="grid items-start gap-6 xl:grid-cols-2">
              {lists.map(({ section, page }) => (
                <NewsSection
                  key={`${section.kind}|${resetKey}`}
                  section={section}
                  initial={page}
                  period={period}
                  today={today}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
