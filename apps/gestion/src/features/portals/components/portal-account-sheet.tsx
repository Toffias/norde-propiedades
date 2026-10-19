'use client';

import type { PortalAccountView } from '@norde/core/portals/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
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
import { useState, useTransition, type ReactNode } from 'react';

import { runAction } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import { EntitySheet } from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { enableLeadNotificationsAction, setPortalAccountEnabledAction } from '../actions';
import { PORTAL_DESCRIPTIONS, PORTAL_LABELS } from '../messages';
import type { PortalCreditsResult, PortalPackagesResult } from '../queries';

import { AccountCodeDialog, DisconnectDialog } from './portal-account-dialogs';
import { Fact, LinkedFacts, PlanFacts, PortalLogo } from './portal-account-facts';
import { accountStatus, connectHref } from './portal-account-status';

/**
 * Panel lateral de una cuenta de portal: repite lo que muestra la tarjeta y suma lo que se gestiona
 * (activar, consultas al instante, vincular avisos, cambiar el código o reconectar, desconectar).
 */
export function PortalAccountSheet({
  account,
  canManage,
  credits,
  packages,
  open,
  onClose,
}: {
  readonly account: PortalAccountView | undefined;
  readonly canManage: boolean;
  readonly credits: PortalCreditsResult | undefined;
  readonly packages: PortalPackagesResult | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <EntitySheet
      open={open}
      onClose={onClose}
      title={account === undefined ? 'Portal' : PORTAL_LABELS[account.portal]}
      description={account?.accountName === undefined ? undefined : `Cuenta ${account.accountName}`}
    >
      {account !== undefined && (
        <SheetContents
          key={account.portal}
          account={account}
          canManage={canManage}
          credits={credits}
          packages={packages}
          onClose={onClose}
        />
      )}
    </EntitySheet>
  );
}

function SheetContents({
  account,
  canManage,
  credits,
  packages,
  onClose,
}: {
  readonly account: PortalAccountView;
  readonly canManage: boolean;
  readonly credits: PortalCreditsResult | undefined;
  readonly packages: PortalPackagesResult | undefined;
  readonly onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [askingCode, setAskingCode] = useState(false);
  const byCode = account.connection === 'account_code';
  const { tone, label } = accountStatus(account);
  const portalLabel = PORTAL_LABELS[account.portal];

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
    <>
      <SheetBody scroll className="gap-6">
        <div className="flex flex-col gap-3">
          <PortalLogo portal={account.portal} className="h-24" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={tone}>{label}</StatusPill>
            {account.paid && <Badge variant="outline">Pago</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{PORTAL_DESCRIPTIONS[account.portal]}</p>
        </div>
        <FormAlert message={error} />

        {!account.isConnected ? (
          <Section title="Conexión">
            <p className="text-sm text-muted-foreground">
              Todavía no hay una cuenta conectada. Conectala para publicar desde las fichas.
            </p>
            {canManage && (
              <ConnectButton
                account={account}
                onAskCode={() => {
                  setAskingCode(true);
                }}
              />
            )}
          </Section>
        ) : (
          <>
            <Section
              title="Cuenta"
              action={
                canManage &&
                (byCode ? (
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
                    <a href={connectHref(account.portal)}>
                      <RefreshCwIcon className="h-4 w-4" aria-hidden />
                      Reconectar
                    </a>
                  </Button>
                ))
              }
            >
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Nombre en el portal">
                  <span className="truncate font-semibold">{account.accountName}</span>
                </Fact>
                <Fact label="Conectada el">
                  <span className="font-semibold">{formatDateTime(account.connectedAt)}</span>
                </Fact>
                <Fact label="Cómo se conecta" className="sm:col-span-2">
                  <span>
                    {byCode
                      ? `Con el código de inmobiliaria de Norde en ${portalLabel}.`
                      : 'Con el usuario de MercadoLibre de Norde, que autorizó al sistema a publicar.'}
                  </span>
                </Fact>
              </dl>
            </Section>

            {account.publishes.length > 0 && (
              <Section title="Publicación">
                <label className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                  <Switch
                    className="mt-0.5"
                    checked={account.isEnabled}
                    disabled={pending || !canManage}
                    onCheckedChange={toggle}
                    aria-label="Activa para publicar"
                  />
                  <span className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium">Activa para publicar</span>
                    <span className="text-muted-foreground">
                      {account.isEnabled
                        ? 'Se puede publicar en esta cuenta desde la pestaña Difusión de cada ficha.'
                        : 'Mientras esté apagada, la cuenta no aparece al publicar desde las fichas.'}
                    </span>
                  </span>
                </label>
              </Section>
            )}

            <Section
              title="Avisos"
              action={
                account.linksExisting && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/mi-empresa/portales/avisos?portal=${account.portal}`}>
                      <Link2Icon className="h-4 w-4" aria-hidden />
                      Vincular avisos
                    </Link>
                  </Button>
                )
              }
            >
              <dl className="grid gap-3 sm:grid-cols-2">
                <LinkedFacts account={account} />
              </dl>
              {account.linksExisting && (
                <p className="text-xs text-muted-foreground">
                  Si hay avisos que se cargaron directo en {portalLabel}, vinculalos con su
                  propiedad para seguirlos desde el sistema.
                </p>
              )}
            </Section>

            {(credits !== undefined || packages !== undefined) && (
              <Section title={credits !== undefined ? 'Plan y créditos' : 'Paquetes'}>
                <dl className="grid gap-3">
                  <PlanFacts credits={credits} packages={packages} />
                </dl>
              </Section>
            )}

            <Section title="Consultas">
              {byCode ? (
                <LeadNotifications account={account} canManage={canManage} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Las consultas de los avisos de esta cuenta entran solas a la bandeja cada 10
                  minutos, y al instante con las notificaciones de la app de MercadoLibre.
                </p>
              )}
            </Section>
          </>
        )}
      </SheetBody>
      <SheetFooter className={account.isConnected && canManage ? 'justify-between' : undefined}>
        {account.isConnected && canManage && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <UnplugIcon className="h-4 w-4" aria-hidden />
            Desconectar
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </SheetFooter>
      <DisconnectDialog account={account} open={confirming} onOpenChange={setConfirming} />
      {askingCode && (
        <AccountCodeDialog
          account={account}
          onClose={() => {
            setAskingCode(false);
          }}
        />
      )}
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Conectar: con el código en un diálogo (Zonaprop) o yendo a MercadoLibre a autorizar. */
export function ConnectButton({
  account,
  onAskCode,
  className,
}: {
  readonly account: PortalAccountView;
  readonly onAskCode: () => void;
  readonly className?: string;
}) {
  const label = `Conectar con ${PORTAL_LABELS[account.portal]}`;
  if (account.connection === 'account_code') {
    return (
      <Button type="button" className={className} onClick={onAskCode}>
        <PlugIcon className="h-4 w-4" aria-hidden />
        {label}
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      {/* Navegación completa: la ruta redirige a MercadoLibre. */}
      <a href={connectHref(account.portal)}>
        <PlugIcon className="h-4 w-4" aria-hidden />
        Conectar con MercadoLibre
      </a>
    </Button>
  );
}

/**
 * Las consultas del portal entran solas a la bandeja cada 10 minutos; con los avisos activados,
 * llegan al instante.
 */
function LeadNotifications({
  account,
  canManage,
}: {
  readonly account: PortalAccountView;
  readonly canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const label = PORTAL_LABELS[account.portal];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Las consultas de {label} entran solas a la bandeja cada 10 minutos. Para que lleguen al
        instante, activá los avisos: {label} le avisa al sistema cada vez que llega un contacto.
      </p>
      <FormAlert message={error} />
      {canManage && (
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
      )}
    </div>
  );
}
