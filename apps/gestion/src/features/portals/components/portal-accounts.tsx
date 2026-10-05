'use client';

import type { PortalAccountView, PortalAccountsView } from '@norde/core/portals/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { SectionCard } from '@norde/ui/components/section-card';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';
import { Switch } from '@norde/ui/components/switch';
import { Loader2Icon, PlugIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import { disconnectPortalAccountAction, setPortalAccountEnabledAction } from '../actions';
import { PORTAL_DESCRIPTIONS, PORTAL_LABELS } from '../messages';

const CONNECT_PATH = '/api/portals/mercadolibre/connect';

function status(account: PortalAccountView): { tone: StatusTone; label: string } {
  if (!account.isConnected) return { tone: 'gray', label: 'Sin conectar' };
  return account.isEnabled
    ? { tone: 'green', label: 'Activa' }
    : { tone: 'amber', label: 'Conectada, sin activar' };
}

/** Mi empresa → Portales: una tarjeta por cuenta, con conectar, activar y desconectar. */
export function PortalAccounts({ view }: { readonly view: PortalAccountsView }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {view.accounts.map((account) => (
        <PortalAccountCard key={account.portal} account={account} canManage={view.canManage} />
      ))}
    </div>
  );
}

function PortalAccountCard({
  account,
  canManage,
}: {
  readonly account: PortalAccountView;
  readonly canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const { tone, label } = status(account);
  const connectHref = `${CONNECT_PATH}?${new URLSearchParams({ portal: account.portal }).toString()}`;

  function toggle(enabled: boolean) {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(() =>
        setPortalAccountEnabledAction({ portal: account.portal, enabled }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(enabled ? 'Cuenta activada' : 'Cuenta desactivada');
    });
  }

  return (
    <SectionCard
      title={PORTAL_LABELS[account.portal]}
      action={<StatusPill tone={tone}>{label}</StatusPill>}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{PORTAL_DESCRIPTIONS[account.portal]}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {account.paid && <Badge variant="outline">Pago</Badge>}
          {account.isConnected ? (
            <span>
              Cuenta <strong className="font-semibold">{account.accountName}</strong>, conectada el{' '}
              {formatDateTime(account.connectedAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">Todavía no hay una cuenta conectada.</span>
          )}
        </div>
        <FormAlert message={error} />
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {account.isConnected ? (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={account.isEnabled}
                    disabled={pending}
                    onCheckedChange={toggle}
                    aria-label="Activa para publicar"
                  />
                  Activa para publicar
                </label>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    {/* Navegación completa: la ruta redirige a MercadoLibre. */}
                    <a href={connectHref}>
                      <RefreshCwIcon className="h-4 w-4" aria-hidden />
                      Reconectar
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    <UnplugIcon className="h-4 w-4" aria-hidden />
                    Desconectar
                  </Button>
                </div>
              </>
            ) : (
              <Button asChild size="sm">
                <a href={connectHref}>
                  <PlugIcon className="h-4 w-4" aria-hidden />
                  Conectar con MercadoLibre
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
      <DisconnectDialog account={account} open={confirming} onOpenChange={setConfirming} />
    </SectionCard>
  );
}

function DisconnectDialog({
  account,
  open,
  onOpenChange,
}: {
  readonly account: PortalAccountView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function close(next: boolean) {
    if (!next) setError(undefined);
    onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      const message = await runAction(() =>
        disconnectPortalAccountAction({ portal: account.portal }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success('Cuenta desconectada');
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar {PORTAL_LABELS[account.portal]}</DialogTitle>
          <DialogDescription>
            Norde deja de tener acceso a la cuenta {account.accountName} y se borran sus
            credenciales. Los avisos que ya están en MercadoLibre no se tocan. Para volver a
            publicar, hay que conectarla de nuevo.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              close(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Desconectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
