'use client';

import {
  SHARED_LISTING_CHANNEL_LABELS,
  SHARED_LISTING_STATUS_LABELS,
  type ClientSendRow,
  type SharedListingStatusValue,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn, DataTableSort } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { StatusPill } from '@norde/ui/components/status-pill';
import { LinkIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';

import { formatDate, formatDateTime } from '../../../lib/format';
import { ConfirmActionDialog } from '../../shared/components/confirm-action-dialog';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { revokeSharedListingAction } from '../shared-listing-actions';

const STATUS_TONES: Readonly<Record<SharedListingStatusValue, 'green' | 'gray' | 'red'>> = {
  available: 'green',
  expired: 'gray',
  revoked: 'red',
};

/** Las propiedades del envío, con lo que le pareció cada una. */
function SentProperties({ row }: { readonly row: ClientSendRow }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {row.properties.map((property) => (
        <li key={property.id} className="inline-flex items-center gap-1">
          {property.code === undefined ? (
            <span className="text-muted-foreground">Ya no está en la cartera</span>
          ) : (
            <Link
              href={`/propiedades/${property.id}` as Route}
              className="font-medium hover:underline"
            >
              {property.code}
            </Link>
          )}
          {property.reaction === 'liked' && (
            <ThumbsUpIcon
              aria-label="Le gustó"
              className="h-3.5 w-3.5 text-success-600 dark:text-success-300"
            />
          )}
          {property.reaction === 'disliked' && (
            <ThumbsDownIcon aria-label="No le gustó" className="h-3.5 w-3.5 text-destructive" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Los envíos de propiedades al contacto (#104): por dónde, si los abrió y qué le gustó. */
export function ClientSendsGrid({
  clientId,
  page,
  sort,
}: {
  readonly clientId: string;
  readonly page: Page<ClientSendRow>;
  readonly sort: DataTableSort;
}) {
  const [revoking, setRevoking] = useState<ClientSendRow | undefined>();
  const columns: readonly DataTableColumn<ClientSendRow>[] = [
    {
      id: 'sentAt',
      header: 'Enviado',
      sortable: true,
      className: 'whitespace-nowrap',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="tabular-nums">{formatDateTime(row.sentAt)}</span>
          <span className="text-xs text-muted-foreground">
            {SHARED_LISTING_CHANNEL_LABELS[row.channel]} · {row.sentBy.name ?? 'Usuario inactivo'}
          </span>
        </div>
      ),
    },
    {
      id: 'properties',
      header: 'Propiedades',
      className: 'whitespace-normal',
      cell: (row) => <SentProperties row={row} />,
    },
    {
      id: 'opened',
      header: 'Abierto',
      showFrom: 'md',
      className: 'whitespace-nowrap',
      cell: (row) =>
        row.firstOpenedAt === undefined ? (
          <span className="text-muted-foreground">Sin abrir</span>
        ) : (
          <div className="flex flex-col">
            <span className="tabular-nums">{formatDateTime(row.firstOpenedAt)}</span>
            <span className="text-xs text-muted-foreground">
              {row.openCount === 1 ? 'Una vez' : `${row.openCount.toLocaleString('es-AR')} veces`}
            </span>
          </div>
        ),
    },
    {
      id: 'status',
      header: 'Link',
      cell: (row) => (
        <span title={`Vence el ${formatDate(row.expiresAt)}`}>
          <StatusPill tone={STATUS_TONES[row.status]}>
            {SHARED_LISTING_STATUS_LABELS[row.status]}
          </StatusPill>
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-12',
      cell: (row) =>
        row.can.revoke ? (
          <RowActions>
            <RowAction
              icon={LinkIcon}
              label="Revocar link"
              onClick={() => {
                setRevoking(row);
              }}
            />
          </RowActions>
        ) : null,
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Envíos"
        columns={columns}
        getRowId={(row) => row.id}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        sort={sort}
        empty="Todavía no se le enviaron propiedades. Envialas desde la pestaña Destacadas."
      />
      <ConfirmActionDialog
        copy={
          revoking === undefined
            ? undefined
            : {
                title: 'Revocar link',
                description:
                  'El contacto ya no va a poder abrir estas propiedades ni marcar cuáles le gustan.',
                confirm: 'Revocar',
                done: 'Link revocado',
              }
        }
        run={() =>
          revoking === undefined
            ? Promise.resolve({ ok: true })
            : revokeSharedListingAction({ clientId, sharedListingId: revoking.id })
        }
        onOpenChange={(open) => {
          if (!open) setRevoking(undefined);
        }}
      />
    </>
  );
}
