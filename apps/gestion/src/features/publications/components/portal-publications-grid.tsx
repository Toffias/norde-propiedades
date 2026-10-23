'use client';

import type { PortalValue } from '@norde/core/portals/contracts';
import type { PortalPublicationRow, PublicationBucketValue } from '@norde/core/reporting/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';

import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import {
  LISTING_OPERATION_LABELS,
  LISTING_STATUS_LABELS,
  LISTING_TYPE_LABELS,
} from '../../portals/labels';
import { PORTAL_SITE_NAMES, planLabel } from '../../portals/messages';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { BUCKET_LABELS } from '../labels';
import { ownerPath } from '../paths';

/** Las publicaciones de un portal detrás de un contador, o lo disponible sin aviso ahí. */
export function PortalPublicationsGrid({
  portal,
  bucket,
  page,
  sort,
}: {
  readonly portal: PortalValue;
  readonly bucket: PublicationBucketValue;
  readonly page: Page<PortalPublicationRow>;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
}) {
  const site = PORTAL_SITE_NAMES[portal];
  const missing = bucket === 'missing';
  const columns: DataTableColumn<PortalPublicationRow>[] = [
    {
      id: 'owner',
      header: 'Publicación',
      className: 'min-w-[12rem] whitespace-normal',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={ownerPath(row.owner)} className="hover:underline">
            <span className="font-semibold">{row.owner.code}</span>
            {' · '}
            {row.owner.kind === 'property' ? row.owner.title : row.owner.name}
          </Link>
          {row.listing?.permalink !== undefined && (
            <a
              href={row.listing.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver en {site}
              <ExternalLinkIcon className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      ),
    },
  ];
  if (!missing) {
    columns.push(
      {
        id: 'listing',
        header: 'Aviso',
        showFrom: 'md',
        cell: (row) => {
          const listing = row.listing;
          if (listing === undefined) return EMPTY_VALUE;
          const parts = [
            listing.operation === undefined
              ? undefined
              : LISTING_OPERATION_LABELS[listing.operation],
            listing.plan === undefined
              ? LISTING_TYPE_LABELS[listing.listingType]
              : `Plan ${planLabel(listing.plan)}`,
          ].filter((part) => part !== undefined);
          return parts.join(' · ');
        },
      },
      {
        id: 'status',
        header: 'Estado',
        className: 'min-w-[10rem] whitespace-normal',
        cell: (row) => {
          const listing = row.listing;
          if (listing === undefined) return EMPTY_VALUE;
          const status = LISTING_STATUS_LABELS[listing.status];
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusPill tone={bucket === 'review' ? 'amber' : status.tone}>
                {bucket === 'review' ? BUCKET_LABELS.review.label : status.label}
              </StatusPill>
              {listing.lastError !== undefined && (
                <span className="text-xs text-muted-foreground">{listing.lastError}</span>
              )}
            </div>
          );
        },
      },
    );
  }
  columns.push({
    id: 'updatedAt',
    header: missing ? 'Actualizada' : 'Último cambio',
    sortable: true,
    showFrom: 'sm',
    cell: (row) => formatDateTime(row.updatedAt),
  });

  return (
    <ServerDataTable
      label={`${BUCKET_LABELS[bucket].label} en ${site}`}
      columns={columns}
      getRowId={(row) => row.listing?.id ?? row.owner.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      empty={
        missing
          ? `Todo lo disponible tiene aviso en ${site}.`
          : `No hay publicaciones ${BUCKET_LABELS[bucket].label.toLowerCase()} en ${site}.`
      }
    />
  );
}
