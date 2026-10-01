import { ListTrashedFilesQuerySchema } from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../../../container';
import { TrashedFilesGrid } from '../../../../../features/settings/components/trashed-files-grid';
import { COMPANY_FILES_ERROR_MESSAGES } from '../../../../../features/settings/messages';
import { messageForError } from '../../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Papelera de archivos' };

export default async function TrashedFilesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListTrashedFilesQuerySchema, await searchParams);
  const result = await getContainer().settings.listTrashedFiles.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href="/mi-empresa/archivos">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a los archivos
        </Link>
      </Button>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES)} />
        ) : (
          <TrashedFilesGrid
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
          />
        )}
      </Card>
    </div>
  );
}
