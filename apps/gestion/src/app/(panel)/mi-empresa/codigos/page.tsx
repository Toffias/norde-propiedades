import { ListReferenceCodeSequencesQuerySchema } from '@norde/core/settings/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { ReferenceCodesGrid } from '../../../../features/settings/components/reference-codes-grid';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Códigos de referencia' };

export default async function ReferenceCodesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(
    ListReferenceCodeSequencesQuerySchema,
    await searchParams,
  );
  const result = await getContainer().settings.listReferenceCodeSequences.execute(query, actor);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-normal text-muted-foreground">
        Cada propiedad y emprendimiento recibe un código al darse de alta: el prefijo que le
        corresponde y un número correlativo propio de ese prefijo. Los códigos nunca se repiten: si
        alguien cargó uno a mano, la numeración lo saltea.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error)} />
        ) : (
          <ReferenceCodesGrid
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            canUpdate={actor.can('settings:update')}
          />
        )}
      </Card>
    </div>
  );
}
