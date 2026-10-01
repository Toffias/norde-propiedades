import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { TableIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { DemoContactsQuerySchema, searchDemoContacts } from '../../_components/demo-contacts-query';
import { PagedContactsGrid } from '../../_components/paged-contacts-grid';

export const metadata: Metadata = { title: 'Grilla paginada' };

export default async function PagedGridPatternPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { value: query, invalidKeys } = parseListParams(
    DemoContactsQuerySchema,
    await searchParams,
  );
  const result = searchDemoContacts(query);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={TableIcon}
        title="Grilla paginada"
        subtitle={`${formatCount(result.total, 'contacto', 'contactos')} · estado en la URL, filas de a una página`}
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {query.demo === 'error' ? (
          <DataTableError message={messageForError({ type: 'Forbidden' })} />
        ) : (
          <PagedContactsGrid
            rows={result.items}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            sort={query.sort}
            text={query.text ?? ''}
            status={query.status ?? 'all'}
          />
        )}
      </Card>
    </div>
  );
}
