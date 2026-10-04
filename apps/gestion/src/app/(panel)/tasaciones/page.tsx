import { ListAppraisalsQuerySchema } from '@norde/core/appraisals/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { CalculatorIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import {
  AppraisalsView,
  type AppraisalFilterValues,
} from '../../../features/appraisals/components/appraisals-view';
import { APPRAISAL_READ_ERROR_MESSAGES } from '../../../features/appraisals/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Tasaciones' };

export default async function AppraisalsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(
    ListAppraisalsQuerySchema,
    await searchParams,
  );
  const result = await getContainer().appraisals.listAppraisals.execute(query, actor);
  const page = result.isOk() ? result.value : undefined;

  const filters: AppraisalFilterValues = {
    view: query.view,
    status: query.status ?? '',
    propertyType: query.propertyType ?? '',
    producerId: query.producerId ?? '',
    appraiserId: query.appraiserId ?? '',
    branchId: query.branchId ?? '',
    createdFrom: query.createdFrom ?? '',
    createdTo: query.createdTo ?? '',
    visitFrom: query.visitFrom ?? '',
    visitTo: query.visitTo ?? '',
  };
  // Los nombres de los usuarios y la sucursal filtrados, para los selectores: salen de las filas.
  const rows = page?.items ?? [];
  const labels = {
    producer: rows.find((row) => row.producer.id === query.producerId)?.producer.name,
    appraiser: rows.find((row) => row.appraiser?.id === query.appraiserId)?.appraiser?.name,
    branch: rows.find((row) => row.branch?.id === query.branchId)?.branch?.name,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={CalculatorIcon}
        title="Tasaciones"
        subtitle="Las tasaciones pedidas por propietarios: pendientes, tasadas, descartadas e ingresadas"
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, APPRAISAL_READ_ERROR_MESSAGES)} />
        ) : (
          <AppraisalsView
            rows={rows}
            total={page?.total ?? 0}
            page={page?.page ?? 1}
            pageSize={page?.pageSize ?? query.pageSize}
            sort={query.sort}
            filters={filters}
            labels={labels}
            permissions={{
              create: actor.can('appraisals:create'),
              delete: actor.can('appraisals:delete'),
              pickUsers: actor.can('users:read'),
              pickBranches: actor.can('branches:read'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
