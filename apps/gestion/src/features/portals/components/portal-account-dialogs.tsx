'use client';

import type { PortalAccountView } from '@norde/core/portals/contracts';
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
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { connectPortalAccountWithCodeAction, disconnectPortalAccountAction } from '../actions';
import { PORTAL_LABELS } from '../messages';

/** Pide el código de la cuenta en el portal (en Zonaprop, el código de inmobiliaria). */
export function AccountCodeDialog({
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

export function DisconnectDialog({
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
