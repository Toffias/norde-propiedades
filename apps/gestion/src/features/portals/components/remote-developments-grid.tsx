'use client';

import type { PortalValue, RemoteDevelopmentView } from '@norde/core/portals/contracts';
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
import { linkDevelopmentListingAction } from '../actions';
import { PORTAL_SITE_NAMES, planLabel } from '../messages';

/**
 * Los emprendimientos que la cuenta tiene online en el portal (los publicó Tokko), con el de Norde
 * que les corresponde por código. Vincular no republica: el aviso conserva su antigüedad, y cada
 * unidad se toma para la unidad de Norde con el mismo código.
 */
export function RemoteDevelopmentsGrid({
  portal,
  page,
}: {
  readonly portal: PortalValue;
  readonly page: Page<RemoteDevelopmentView>;
}) {
  const site = PORTAL_SITE_NAMES[portal];
  const columns: readonly DataTableColumn<RemoteDevelopmentView>[] = [
    {
      id: 'title',
      header: 'Emprendimiento',
      className: 'min-w-[12rem] whitespace-normal break-words',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{row.title}</span>
          <span className="text-xs text-muted-foreground">
            {[
              row.location,
              row.unitCount === 1 ? '1 unidad' : `${String(row.unitCount)} unidades`,
              `N.º ${row.remoteId}`,
            ]
              .filter(Boolean)
              .join(' · ')}
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
      id: 'development',
      header: 'En Norde',
      className: 'min-w-[10rem] whitespace-normal',
      cell: (row) => <DevelopmentCell row={row} portal={portal} />,
    },
  ];

  return (
    <ServerDataTable
      label={`Emprendimientos online en ${site}`}
      columns={columns}
      getRowId={(row) => row.remoteId}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      pageSizes={[20, 50]}
      empty={`No hay emprendimientos online en ${site}.`}
    />
  );
}

function DevelopmentCell({
  row,
  portal,
}: {
  readonly row: RemoteDevelopmentView;
  readonly portal: PortalValue;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  if (row.linked) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusPill tone="green">Vinculado</StatusPill>
        <Link
          href={`/emprendimientos/${row.linked.developmentId}?tab=difusion`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver el emprendimiento
        </Link>
      </div>
    );
  }
  const { match } = row;
  if (!match) {
    return (
      <span className="text-sm text-muted-foreground">
        Sin emprendimiento con esa clave. Vinculalo desde su ficha, en Difusión.
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Link href={`/emprendimientos/${match.developmentId}`} className="text-sm hover:underline">
        <span className="font-semibold">{match.code}</span> · {match.name}
      </Link>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const message = await runAction(() =>
              linkDevelopmentListingAction({
                portal,
                developmentId: match.developmentId,
                remoteId: row.remoteId,
              }),
            );
            if (message !== undefined) {
              setError(message);
              return;
            }
            toast.success(`Emprendimiento vinculado a ${match.code}`);
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
