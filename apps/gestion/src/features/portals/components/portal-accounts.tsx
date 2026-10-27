'use client';

import {
  PortalSchema,
  type PortalAccountView,
  type PortalAccountsView,
  type PortalValue,
} from '@norde/core/portals/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { StatusPill } from '@norde/ui/components/status-pill';
import { EyeIcon, Settings2Icon } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';

import { formatDate } from '../../../lib/format';
import { useLastDefined } from '../../shared/components/entity-sheet';
import { PORTAL_DESCRIPTIONS, PORTAL_LABELS } from '../messages';
import type { PortalCreditsResult, PortalPackagesResult } from '../queries';

import { AccountCodeDialog } from './portal-account-dialogs';
import { Fact, LinkedFacts, PlanFacts, PortalLogo } from './portal-account-facts';
import { ConnectButton, PortalAccountSheet } from './portal-account-sheet';
import { accountStatus } from './portal-account-status';

type Credits = Readonly<Partial<Record<PortalValue, PortalCreditsResult>>>;
type Packages = Readonly<Partial<Record<PortalValue, PortalPackagesResult>>>;

/** El panel de una cuenta vive en la URL (`?panel=zonaprop`): se puede recargar y compartir. */
const PANEL_PARAM = 'panel';

function usePortalPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsed = PortalSchema.safeParse(searchParams.get(PANEL_PARAM));
  const [panel, setOptimisticPanel] = useOptimistic(parsed.success ? parsed.data : undefined);
  const [, startTransition] = useTransition();

  function navigate(next: PortalValue | undefined) {
    const params = new URLSearchParams(searchParams);
    if (next === undefined) params.delete(PANEL_PARAM);
    else params.set(PANEL_PARAM, next);
    const query = params.toString();
    // Misma ruta con otros query params: typedRoutes no puede verificar un string armado.
    const href = `${pathname}${query === '' ? '' : `?${query}`}` as Route;
    startTransition(() => {
      setOptimisticPanel(next);
      router.replace(href, { scroll: false });
    });
  }

  return {
    panel,
    open: (portal: PortalValue) => {
      navigate(portal);
    },
    close: () => {
      navigate(undefined);
    },
  };
}

/**
 * Mi empresa → Portales: una tarjeta a lo ancho por cuenta, con el logo del portal y lo que hay que
 * saber de un vistazo (cuenta, avisos vinculados, plan y créditos). Lo que se gestiona va en un
 * panel lateral.
 */
export function PortalAccounts({
  view,
  credits,
  packages,
}: {
  readonly view: PortalAccountsView;
  readonly credits: Credits;
  readonly packages: Packages;
}) {
  const { panel, open, close } = usePortalPanel();
  const shown = useLastDefined(panel);
  const account = view.accounts.find((a) => a.portal === shown);

  return (
    <div className="flex flex-col gap-4">
      {view.accounts.map((a) => (
        <PortalAccountCard
          key={a.portal}
          account={a}
          canManage={view.canManage}
          credits={credits[a.portal]}
          packages={packages[a.portal]}
          onOpen={() => {
            open(a.portal);
          }}
        />
      ))}
      <PortalAccountSheet
        account={account}
        canManage={view.canManage}
        credits={account === undefined ? undefined : credits[account.portal]}
        packages={account === undefined ? undefined : packages[account.portal]}
        open={panel !== undefined}
        onClose={close}
      />
    </div>
  );
}

function PortalAccountCard({
  account,
  canManage,
  credits,
  packages,
  onOpen,
}: {
  readonly account: PortalAccountView;
  readonly canManage: boolean;
  readonly credits: PortalCreditsResult | undefined;
  readonly packages: PortalPackagesResult | undefined;
  readonly onOpen: () => void;
}) {
  const [askingCode, setAskingCode] = useState(false);
  const { tone, label } = accountStatus(account);

  return (
    <Card className="flex flex-col gap-0 overflow-hidden p-0 md:flex-row">
      <div className="flex shrink-0 items-center justify-center border-b border-border bg-muted/40 p-4 md:w-60 md:border-r md:border-b-0 md:p-5">
        <PortalLogo portal={account.portal} className="h-20 w-full max-w-[220px] md:h-24" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-base font-bold">
              {PORTAL_LABELS[account.portal]}
              {account.paid && <Badge variant="outline">Pago</Badge>}
            </h2>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <StatusPill tone={tone}>{label}</StatusPill>
              {account.isConnected && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="-my-1"
                  onClick={onOpen}
                >
                  {canManage ? (
                    <Settings2Icon className="h-4 w-4" aria-hidden />
                  ) : (
                    <EyeIcon className="h-4 w-4" aria-hidden />
                  )}
                  {canManage ? 'Gestionar conexión' : 'Ver detalle'}
                </Button>
              )}
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {PORTAL_DESCRIPTIONS[account.portal]}
          </p>
          {account.needsReconnect && (
            <p className="text-sm text-destructive">
              El portal rechazó el acceso de la cuenta: no se sincroniza nada hasta volver a
              conectarla{canManage ? ' (Gestionar conexión → Reconectar).' : '.'}
            </p>
          )}
        </div>

        {account.isConnected ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Fact label="Cuenta">
              <span className="truncate text-lg leading-tight font-semibold">
                {account.accountName}
              </span>
              <span className="text-xs text-muted-foreground">
                Conectada el {formatDate(account.connectedAt)}
              </span>
            </Fact>
            <LinkedFacts account={account} />
            <PlanFacts credits={credits} packages={packages} />
          </dl>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Todavía no hay una cuenta conectada.
              {canManage
                ? ' Conectala para publicar desde las fichas y recibir sus consultas en la bandeja.'
                : ' Pedile a quien administra los portales que la conecte.'}
            </p>
            {canManage && (
              <ConnectButton
                account={account}
                className="shrink-0"
                onAskCode={() => {
                  setAskingCode(true);
                }}
              />
            )}
          </div>
        )}
      </div>
      {askingCode && (
        <AccountCodeDialog
          account={account}
          onClose={() => {
            setAskingCode(false);
          }}
        />
      )}
    </Card>
  );
}
