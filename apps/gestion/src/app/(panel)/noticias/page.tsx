import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { NewspaperIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { getContainer } from '../../../container';
import { NewsFeed } from '../../../features/news/components/news-feed';
import { NewsKindsFilter } from '../../../features/news/components/news-kinds-filter';
import { NEWS_ERROR_MESSAGES } from '../../../features/news/messages';
import { NEWS_KINDS_COOKIE, parseNewsKinds } from '../../../features/news/news-kinds';
import { messageForError } from '../../../lib/errors';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Noticias' };

export default async function NewsPage() {
  const { actor } = await requireSession();
  const kinds = parseNewsKinds((await cookies()).get(NEWS_KINDS_COOKIE)?.value);
  const result = await getContainer().news.listNews.execute({ kinds }, actor);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        icon={NewspaperIcon}
        title="Noticias"
        subtitle="Lo que pasa en la empresa, día por día"
        actions={result.isOk() ? <NewsKindsFilter selected={kinds} /> : undefined}
      />
      {result.isErr() ? (
        <Card className="p-0">
          <DataTableError message={messageForError(result.error, NEWS_ERROR_MESSAGES)} />
        </Card>
      ) : (
        <NewsFeed key={kinds.join(',')} initial={result.value} kinds={kinds} />
      )}
    </div>
  );
}
