'use client';

import type {
  PortalAccountView,
  PortalAccountsView,
  PortalCreditView,
  PortalPackageView,
} from '@norde/core/portals/contracts';
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
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { SectionCard } from '@norde/ui/components/section-card';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';
import { Switch } from '@norde/ui/components/switch';
import {
  BellRingIcon,
  Link2Icon,
  Loader2Icon,
  PlugIcon,
  RefreshCwIcon,
  UnplugIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { formatDate, formatDateTime } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import {
  enableLeadNotificationsAction,
  connectPortalAccountWithCodeAction,
  disconnectPortalAccountAction,
  setPortalAccountEnabledAction,
} from '../actions';
import {
  PACKAGE_CONTENT_LABELS,
  PORTAL_DESCRIPTIONS,
  PORTAL_LABELS,
  packageTierLabel,
  planLabel,
} from '../messages';
import type { PortalCreditsResult, PortalPackagesResult } from '../queries';

const CONNECT_PATH = '/api/portals/mercadolibre/connect';

function status(account: PortalAccountView): { tone: StatusTone; label: string } {
  if (!account.isConnected) return { tone: 'gray', label: 'Sin conectar' };
  // Una cuenta que todavía no publica nada no se activa.
  if (account.publishes.length === 0) return { tone: 'green', label: 'Conectada' };
  return account.isEnabled
    ? { tone: 'green', label: 'Activa' }
    : { tone: 'amber', label: 'Conectada, sin activar' };
}

/**
 * Mi empresa → Portales: una tarjeta por cuenta, con conectar, activar y desconectar. Las cuentas
 * conectadas por código (Zonaprop) muestran además sus créditos, y las de MercadoLibre el cupo de
 * sus paquetes.
 */
export function PortalAccounts({
  view,
  credits,
  packages,
}: {
  readonly view: PortalAccountsView;
  readonly credits: Readonly<Partial<Record<PortalAccountView['portal'], PortalCreditsResult>>>;
  readonly packages: Readonly<Partial<Record<PortalAccountView['portal'], PortalPackagesResult>>>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {view.accounts.map((account) => (
        <PortalAccountCard
          key={account.portal}
          account={account}
          canManage={view.canManage}
          credits={credits[account.portal]}
          packages={packages[account.portal]}
        />
      ))}
    </div>
  );
}

function PortalAccountCard({
  account,
  canManage,
  credits,
  packages,
}: {
  readonly account: PortalAccountView;
  readonly canManage: boolean;
  readonly credits: PortalCreditsResult | undefined;
  readonly packages: PortalPackagesResult | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [askingCode, setAskingCode] = useState(false);
  const byCode = account.connection === 'account_code';
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
        {credits !== undefined && <PortalCredits result={credits} />}
        {packages !== undefined && <PortalPackages result={packages} />}
        {byCode && account.isConnected && canManage && <LeadNotifications account={account} />}
        {!byCode && account.isConnected && (
          <p className="text-sm text-muted-foreground">
            Las consultas de los avisos de esta cuenta entran solas a la bandeja cada 10 minutos, y
            al instante con las notificaciones de la app de MercadoLibre.
          </p>
        )}
        {account.linksExisting && account.isConnected && (
          <Link
            href={`/mi-empresa/portales/avisos?portal=${account.portal}`}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline"
          >
            <Link2Icon className="h-4 w-4" aria-hidden />
            Vincular los avisos que ya están en {PORTAL_LABELS[account.portal]}
          </Link>
        )}
        <FormAlert message={error} />
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {account.isConnected ? (
              <>
                {account.publishes.length > 0 && (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={account.isEnabled}
                      disabled={pending}
                      onCheckedChange={toggle}
                      aria-label="Activa para publicar"
                    />
                    Activa para publicar
                  </label>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  {byCode ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAskingCode(true);
                      }}
                    >
                      <RefreshCwIcon className="h-4 w-4" aria-hidden />
                      Cambiar código
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      {/* Navegación completa: la ruta redirige a MercadoLibre. */}
                      <a href={connectHref}>
                        <RefreshCwIcon className="h-4 w-4" aria-hidden />
                        Reconectar
                      </a>
                    </Button>
                  )}
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
            ) : byCode ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAskingCode(true);
                }}
              >
                <PlugIcon className="h-4 w-4" aria-hidden />
                Conectar con {PORTAL_LABELS[account.portal]}
              </Button>
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
      {askingCode && (
        <AccountCodeDialog
          account={account}
          onClose={() => {
            setAskingCode(false);
          }}
        />
      )}
    </SectionCard>
  );
}

/** Los créditos de publicación que le quedan a la cuenta, por plan. */
function PortalCredits({ result }: { readonly result: PortalCreditsResult }) {
  if (!result.ok) {
    return <p className="text-sm text-muted-foreground">{result.message}</p>;
  }
  if (result.credits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">La cuenta no tiene créditos de publicación.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Créditos disponibles</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {result.credits.map((credit) => (
          <CreditItem key={credit.plan} credit={credit} />
        ))}
      </ul>
    </div>
  );
}

function CreditItem({ credit }: { readonly credit: PortalCreditView }) {
  return (
    <li className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">{planLabel(credit.plan)}</span>
      <span className="shrink-0 font-semibold tabular-nums">
        {credit.available}
        {credit.contracted !== undefined && (
          <span className="font-normal text-muted-foreground"> de {credit.contracted}</span>
        )}
      </span>
    </li>
  );
}

/** El cupo que le queda a cada paquete activo de la cuenta de MercadoLibre. */
function PortalPackages({ result }: { readonly result: PortalPackagesResult }) {
  if (!result.ok) {
    return <p className="text-sm text-muted-foreground">{result.message}</p>;
  }
  if (result.packages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        La cuenta no tiene paquetes activos: MercadoLibre no deja publicar inmuebles sin un paquete.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Cupo de los paquetes</h3>
      <ul className="flex flex-col gap-2">
        {result.packages.map((pack) => (
          <PackageItem key={pack.id} pack={pack} />
        ))}
      </ul>
    </div>
  );
}

function PackageItem({ pack }: { readonly pack: PortalPackageView }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 font-medium">
          {pack.name}{' '}
          <span className="font-normal text-muted-foreground">
            · {PACKAGE_CONTENT_LABELS[pack.content]}
          </span>
        </span>
        {pack.expiresAt !== undefined && (
          <span className="shrink-0 text-xs text-muted-foreground">
            Vence el {formatDate(pack.expiresAt)}
          </span>
        )}
      </div>
      {pack.quotas.length === 0 ? (
        <span className="text-muted-foreground">Sin límite de avisos.</span>
      ) : (
        pack.quotas.map((quota) => (
          <div key={quota.tier} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-muted-foreground">
              {packageTierLabel(quota.tier)}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {quota.remaining}
              <span className="font-normal text-muted-foreground"> libres de {quota.total}</span>
            </span>
          </div>
        ))
      )}
    </li>
  );
}

/** Pide el código de la cuenta en el portal (en Zonaprop, el código de inmobiliaria). */
function AccountCodeDialog({
  account,
  onClose,
}: {
  readonly account: PortalAccountView;
  readonly onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const label = PORTAL_LABELS[account.portal];
  const inputId = `${account.portal}-account-code`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar {label}</DialogTitle>
          <DialogDescription>
            Ingresá el código de inmobiliaria de Norde en {label}. Lo verificamos con {label}: la
            inmobiliaria tiene que estar asociada a Norde como integrador.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            startTransition(async () => {
              const message = await runAction(() =>
                connectPortalAccountWithCodeAction({ portal: account.portal, accountCode: code }),
              );
              if (message !== undefined) {
                setError(message);
                return;
              }
              toast.success('Cuenta conectada');
              onClose();
            });
          }}
        >
          <FormAlert message={error} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Código de inmobiliaria</Label>
            <Input
              id={inputId}
              autoFocus
              autoComplete="off"
              maxLength={64}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || code.trim() === ''}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Conectar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
            {account.connection === 'account_code' ? (
              <>
                Norde deja de usar la inmobiliaria {account.accountName} en{' '}
                {PORTAL_LABELS[account.portal]}. Los avisos que ya están publicados no se tocan.
                Para volver a publicar, hay que conectarla de nuevo.
              </>
            ) : (
              <>
                Norde deja de tener acceso a la cuenta {account.accountName} y se borran sus
                credenciales. Los avisos que ya están en MercadoLibre no se tocan. Para volver a
                publicar, hay que conectarla de nuevo.
              </>
            )}
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

/**
 * Las consultas del portal entran solas a la bandeja cada 10 minutos; con los avisos activados,
 * llegan al instante.
 */
function LeadNotifications({ account }: { readonly account: PortalAccountView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const label = PORTAL_LABELS[account.portal];

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <p className="text-sm text-muted-foreground">
        Las consultas de {label} entran solas a la bandeja cada 10 minutos. Para que lleguen al
        instante, activá los avisos: {label} le avisa al sistema cada vez que llega un contacto.
      </p>
      <FormAlert message={error} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const message = await runAction(() =>
              enableLeadNotificationsAction({ portal: account.portal }),
            );
            if (message !== undefined) {
              setError(message);
              return;
            }
            toast.success(`Avisos de ${label} activados`);
          });
        }}
      >
        {pending ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          <BellRingIcon className="h-4 w-4" aria-hidden />
        )}
        Recibir las consultas al instante
      </Button>
    </div>
  );
}
