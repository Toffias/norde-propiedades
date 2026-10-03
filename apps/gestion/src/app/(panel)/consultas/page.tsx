import { ListInquiriesQuerySchema } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { InboxIcon, WorkflowIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { inquiryRulesEnabled } from '../../../config/env';
import { getContainer } from '../../../container';
import {
  InquiriesView,
  type InquiryFilterValues,
} from '../../../features/inquiries/components/inquiries-view';
import { INQUIRY_LIST_ERROR_MESSAGES } from '../../../features/inquiries/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Consultas' };

export default async function InquiriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(
    ListInquiriesQuerySchema,
    await searchParams,
  );
  const result = await getContainer().inquiries.listInquiries.execute(query, actor);

  const filters: InquiryFilterValues = {
    tab: query.tab,
    branchId: query.branchId ?? '',
    channel: query.channel ?? '',
    propertyId: query.propertyId ?? '',
    receivedFrom: query.receivedFrom ?? '',
    receivedTo: query.receivedTo ?? '',
  };
  // Los nombres de la propiedad y la sucursal filtradas, para los selectores: salen de las filas.
  const rows = result.isOk() ? result.value.items : [];
  const filteredProperty = rows.find((row) => row.property?.id === query.propertyId)?.property;
  const branchLabel = rows.find((row) => row.branch?.id === query.branchId)?.branch?.name;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={InboxIcon}
        title="Consultas"
        subtitle="Lo que llega de los portales y de la web, hasta que se asigna a un contacto"
        actions={
          inquiryRulesEnabled() &&
          actor.can('inquiries:manage') && (
            <Button asChild variant="outline" size="sm">
              <Link href="/consultas/reglas">
                <WorkflowIcon className="h-4 w-4" />
                Reglas de asignación
              </Link>
            </Button>
          )
        }
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, INQUIRY_LIST_ERROR_MESSAGES)} />
        ) : (
          <InquiriesView
            rows={rows}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            renderedAt={new Date().toISOString()}
            filters={filters}
            propertyLabel={
              filteredProperty && `${filteredProperty.code} · ${filteredProperty.title}`
            }
            branchLabel={branchLabel}
            permissions={{
              manage: actor.can('inquiries:manage'),
              pickAgents: actor.can('users:read'),
              pickBranches: actor.can('branches:read'),
              pickProperties: actor.can('properties:read'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
