'use client';

import type { PortalValue, RemoteListingView } from '@norde/core/portals/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ExternalLinkIcon, Link2Icon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { linkPortalListingAction } from '../actions';
import { PORTAL_SITE_NAMES, planLabel } from '../messages';

/**
 * Los avisos que la cuenta tiene online en el portal (los publicó Tokko), con la propiedad que les
 * corresponde por código de referencia. Vincular no republica: el aviso conserva su antigüedad.
 */
export function RemoteListingsGrid({
  portal,
  page,
}: {
  readonly portal: PortalValue;
  readonly page: Page<RemoteListingView>;
}) {
  const site = PORTAL_SITE_NAMES[portal];
  const columns: readonly DataTableColumn<RemoteListingView>[] = [
    {
      id: 'title',
      header: 'Aviso',
      // Los títulos de Tokko son largos y sin espacios cortos: que corten línea.
      className: 'min-w-[12rem] whitespace-normal break-words',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{row.title}</span>
          <span className="text-xs text-muted-foreground">
            {[row.location, `N.º ${row.remoteId}`].filter(Boolean).join(' · ')}
          </span>
          {row.permalink && (
            <a
              href={row.permalink}
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
    {
      id: 'reference',
      header: 'Clave interna',
      showFrom: 'md',
      cell: (row) => row.reference ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'plan',
      header: 'Plan',
      showFrom: 'lg',
      cell: (row) =>
        row.plan === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          planLabel(row.plan)
        ),
    },
    {
      id: 'property',
      header: 'Propiedad',
      className: 'min-w-[10rem] whitespace-normal',
      cell: (row) => <PropertyCell row={row} portal={portal} />,
    },
  ];

  return (
    <ServerDataTable
      label={`Avisos online en ${site}`}
      columns={columns}
      getRowId={(row) => row.remoteId}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      pageSizes={[20, 50]}
      empty={`No hay avisos online en ${site}.`}
    />
  );
}

function PropertyCell({
  row,
  portal,
}: {
  readonly row: RemoteListingView;
  readonly portal: PortalValue;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  if (row.linked) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusPill tone="green">Vinculado</StatusPill>
        <Link
          href={`/propiedades/${row.linked.propertyId}?tab=difusion`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver la propiedad
        </Link>
      </div>
    );
  }
  if (row.isDevelopment) {
    return (
      <span className="text-sm text-muted-foreground">
        Emprendimiento: se vincula con los emprendimientos.
      </span>
    );
  }
  const { match } = row;
  if (!match) {
    return (
      <span className="text-sm text-muted-foreground">
        Sin propiedad con esa clave. Vinculalo desde la ficha, en Difusión.
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Link href={`/propiedades/${match.propertyId}`} className="text-sm hover:underline">
        <span className="font-semibold">{match.code}</span> · {match.title}
      </Link>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const message = await runAction(() =>
              linkPortalListingAction({
                portal,
                propertyId: match.propertyId,
                remoteId: row.remoteId,
              }),
            );
            if (message !== undefined) {
              setError(message);
              return;
            }
            toast.success(`Aviso vinculado a ${match.code}`);
          });
        }}
      >
        {busy ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          <Link2Icon className="h-4 w-4" aria-hidden />
        )}
        Vincular
      </Button>
      <FormAlert message={error} />
    </div>
  );
}
