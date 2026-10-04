import { ListReservationsQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { CalendarCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import {
  ReservationsView,
  type ReservationFilterValues,
} from '../../../features/properties/components/reservations/reservations-view';
import { RESERVATION_READ_ERROR_MESSAGES } from '../../../features/properties/reservation-messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Reservas' };

export default async function ReservationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(
    ListReservationsQuerySchema,
    await searchParams,
  );
  const result = await getContainer().properties.listReservations.execute(query, actor);
  const page = result.isOk() ? result.value : undefined;

  const filters: ReservationFilterValues = {
    status: query.status ?? '',
    operation: query.operation ?? '',
    propertyType: query.propertyType ?? '',
    agentId: query.agentId ?? '',
    managerId: query.managerId ?? '',
    branchId: query.branchId ?? '',
    reservedFrom: query.reservedFrom ?? '',
    reservedTo: query.reservedTo ?? '',
    signingFrom: query.signingFrom ?? '',
    signingTo: query.signingTo ?? '',
  };
  // Los nombres del agente y del gerente filtrados, para los selectores: salen de las filas.
  const rows = page?.items ?? [];
  const labels = {
    agent: rows.find((row) => row.agent?.id === query.agentId)?.agent?.name,
    manager: rows.find((row) => row.manager?.id === query.managerId)?.manager?.name,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={CalendarCheckIcon}
        title="Reservas"
        subtitle="Las reservas de todas las propiedades: activas, caídas y firmadas"
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground print:hidden">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0 print:border-0 print:shadow-none">
        {result.isErr() ? (
          <DataTableError
            message={messageForError(result.error, RESERVATION_READ_ERROR_MESSAGES)}
          />
        ) : (
          <ReservationsView
            rows={rows}
            total={page?.total ?? 0}
            page={page?.page ?? 1}
            pageSize={page?.pageSize ?? query.pageSize}
            sort={query.sort}
            filters={filters}
            labels={labels}
            permissions={{
              export: actor.can('reservations:export'),
              pickUsers: actor.can('users:read'),
              pickBranches: actor.can('branches:read'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
