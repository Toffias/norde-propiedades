import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { StatusPill } from '@norde/ui/components/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@norde/ui/components/table';
import { ArrowLeftIcon, ColumnsIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../../container';
import {
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../../../../features/properties/labels';
import { COMPARE_ERROR_MESSAGES } from '../../../../features/properties/messages';
import { COMPARE_ROWS } from '../../../../features/properties/property-format';
import { messageForError } from '../../../../lib/errors';
import type { SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Comparar propiedades' };

/** De 2 a 4 propiedades lado a lado. Se llega marcándolas en el buscador. */
export default async function ComparePropertiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const ids = Array.isArray(params.ids) ? params.ids.join(',') : (params.ids ?? '');
  const result = await getContainer().properties.compareProperties.execute({ ids }, actor);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ColumnsIcon}
        title="Comparar propiedades"
        subtitle="Precio, superficies, ambientes y ubicación, lado a lado"
      />
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href="/propiedades">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al buscador
        </Link>
      </Button>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, COMPARE_ERROR_MESSAGES)} />
        ) : (
          <div className="table-responsive">
            <Table aria-label="Comparación de propiedades">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-40">
                    <span className="sr-only">Dato</span>
                  </TableHead>
                  {result.value.map((row) => (
                    <TableHead key={row.id} className="min-w-[180px] align-top">
                      <div className="flex flex-col gap-1 py-1 whitespace-normal">
                        <span className="text-xs tabular-nums">
                          {row.code} · {PROPERTY_TYPE_LABELS[row.propertyType]}
                        </span>
                        <span className="font-semibold text-foreground">{row.portalTitle}</span>
                        <StatusPill
                          tone={PROPERTY_STATUS_DISPLAY[row.status].tone}
                          className="self-start"
                        >
                          {PROPERTY_STATUS_DISPLAY[row.status].label}
                        </StatusPill>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPARE_ROWS.map((line) => (
                  <TableRow key={line.label}>
                    <TableCell className="font-medium text-muted-foreground">
                      {line.label}
                    </TableCell>
                    {result.value.map((row) => (
                      <TableCell key={row.id} className="whitespace-normal tabular-nums">
                        {line.value(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
