import { ListFolderContentsQuerySchema } from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import { DataTableError } from '@norde/ui/components/data-table';
import { Trash2Icon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../../container';
import { CompanyFilesGrid } from '../../../../features/settings/components/company-files-grid';
import { COMPANY_FILES_ERROR_MESSAGES } from '../../../../features/settings/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Archivos de la empresa' };

export default async function CompanyFilesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { carpeta, ...params } = await searchParams;
  const { value: query } = parseListParams(ListFolderContentsQuerySchema, {
    ...params,
    folderId: carpeta,
  });
  const result = await getContainer().settings.listFolderContents.execute(query, actor);
  const canManage = actor.can('company-files:manage');

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <Button asChild variant="outline" size="sm" className="self-end">
          <Link href="/mi-empresa/archivos/papelera">
            <Trash2Icon className="h-4 w-4" />
            Papelera
          </Link>
        </Button>
      )}
      {result.isErr() ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <DataTableError message={messageForError(result.error, COMPANY_FILES_ERROR_MESSAGES)} />
        </div>
      ) : (
        <CompanyFilesGrid
          folderId={query.folderId}
          breadcrumb={result.value.breadcrumb}
          rows={result.value.entries.items}
          total={result.value.entries.total}
          page={result.value.entries.page}
          pageSize={result.value.entries.pageSize}
          sort={query.sort}
          canUpload={actor.can('company-files:upload')}
          canManage={canManage}
        />
      )}
    </div>
  );
}
