'use client';

import {
  ConfirmPasswordInputSchema,
  TwoFactorCodeInputSchema,
  type ConfirmPasswordInput,
  type TwoFactorCodeInput,
} from '@norde/core/identity/contracts';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { PasswordInput } from '@norde/ui/components/password-input';
import { SectionCard } from '@norde/ui/components/section-card';
import { toast } from '@norde/ui/components/sonner';
import { CopyIcon, DownloadIcon, Loader2Icon, ShieldCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { authClient } from '../../../lib/auth-client';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { manualEntryKey, twoFactorSettingsError } from '../two-factor';

type Flow = 'enable' | 'regenerate' | 'disable';

interface Failure {
  readonly status: number;
  readonly code?: string | undefined;
}

/** "Mi cuenta": activar, desactivar y regenerar los códigos de la verificación en dos pasos. */
export function TwoFactorSettings({ enabled }: { readonly enabled: boolean }) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | undefined>();

  function close() {
    setFlow(undefined);
    router.refresh();
  }

  return (
    <SectionCard
      title="Verificación en dos pasos"
      icon={ShieldCheckIcon}
      action={
        enabled ? (
          <Badge variant="success">Activa</Badge>
        ) : (
          <Badge variant="secondary">Desactivada</Badge>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-normal text-muted-foreground">
          {enabled
            ? 'Al ingresar, después de la contraseña te pedimos el código de la app autenticadora de tu celular. Si no lo tenés a mano, podés usar un código de respaldo.'
            : 'Sumá un segundo paso al ingresar: además de la contraseña, un código que genera una app autenticadora en tu celular (Google Authenticator, Microsoft Authenticator u otra). Si alguien consigue tu contraseña, igual no puede entrar.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setFlow('regenerate');
                }}
              >
                Generar códigos de respaldo nuevos
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFlow('disable');
                }}
              >
                Desactivar
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setFlow('enable');
              }}
            >
              Activar
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={flow !== undefined}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {flow === 'enable' && <EnableFlow onDone={close} />}
          {flow === 'regenerate' && <RegenerateFlow onDone={close} />}
          {flow === 'disable' && <DisableFlow onDone={close} />}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function EnableFlow({ onDone }: { readonly onDone: () => void }) {
  const [setup, setSetup] = useState<{ totpUri: string; backupCodes: readonly string[] }>();
  const [verified, setVerified] = useState(false);

  if (setup === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Activar la verificación en dos pasos</DialogTitle>
          <DialogDescription>Confirmá tu contraseña para empezar.</DialogDescription>
        </DialogHeader>
        <PasswordStep
          submitLabel="Continuar"
          onCancel={onDone}
          onSubmit={async (password) => {
            const { data, error } = await authClient.twoFactor.enable({ password });
            if (error) return error;
            if (!('totpURI' in data)) return { status: 500 };
            setSetup({ totpUri: data.totpURI, backupCodes: data.backupCodes });
            return undefined;
          }}
        />
      </>
    );
  }

  if (!verified) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Escaneá el código con la app</DialogTitle>
          <DialogDescription>
            Abrí la app autenticadora, agregá una cuenta y escaneá este QR. Después ingresá el
            código de 6 dígitos que te muestra.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {/* Fondo blanco fijo: las apps no leen bien un QR claro sobre oscuro. */}
          <div className="rounded-md bg-white p-3">
            <QRCodeSVG value={setup.totpUri} size={176} title="QR para la app autenticadora" />
          </div>
          <p className="text-center text-xs leading-normal text-muted-foreground">
            ¿No podés escanearlo? Cargá esta clave a mano:
            <br />
            <span className="font-mono text-sm text-foreground select-all">
              {manualEntryKey(setup.totpUri)}
            </span>
          </p>
        </div>
        <CodeStep
          onCancel={onDone}
          onSubmit={async (code) => {
            const { error } = await authClient.twoFactor.verifyTotp({ code });
            if (error) return error;
            setVerified(true);
            return undefined;
          }}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Listo: guardá los códigos de respaldo</DialogTitle>
        <DialogDescription>
          La verificación en dos pasos quedó activa. Si perdés el celular, entrás con uno de estos
          códigos (cada uno sirve una vez). Guardalos en un lugar seguro: no los vas a volver a ver.
        </DialogDescription>
      </DialogHeader>
      <BackupCodes codes={setup.backupCodes} />
      <DialogFooter>
        <Button onClick={onDone}>Ya los guardé</Button>
      </DialogFooter>
    </>
  );
}

function RegenerateFlow({ onDone }: { readonly onDone: () => void }) {
  const [codes, setCodes] = useState<readonly string[]>();

  if (codes === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Generar códigos de respaldo nuevos</DialogTitle>
          <DialogDescription>
            Los códigos que tenías dejan de servir. Confirmá tu contraseña para seguir.
          </DialogDescription>
        </DialogHeader>
        <PasswordStep
          submitLabel="Generar"
          onCancel={onDone}
          onSubmit={async (password) => {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
            if (error) return error;
            setCodes(data.backupCodes);
            return undefined;
          }}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tus códigos de respaldo nuevos</DialogTitle>
        <DialogDescription>
          Cada uno sirve una vez. Guardalos en un lugar seguro: no los vas a volver a ver.
        </DialogDescription>
      </DialogHeader>
      <BackupCodes codes={codes} />
      <DialogFooter>
        <Button onClick={onDone}>Ya los guardé</Button>
      </DialogFooter>
    </>
  );
}

function DisableFlow({ onDone }: { readonly onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Desactivar la verificación en dos pasos</DialogTitle>
        <DialogDescription>
          Vas a ingresar solo con la contraseña. La app autenticadora y los códigos de respaldo
          dejan de servir. Confirmá tu contraseña.
        </DialogDescription>
      </DialogHeader>
      <PasswordStep
        submitLabel="Desactivar"
        destructive
        onCancel={onDone}
        onSubmit={async (password) => {
          const { error } = await authClient.twoFactor.disable({ password });
          if (error) return error;
          toast.success('Desactivaste la verificación en dos pasos');
          onDone();
          return undefined;
        }}
      />
    </>
  );
}

function PasswordStep({
  submitLabel,
  destructive = false,
  onCancel,
  onSubmit,
}: {
  readonly submitLabel: string;
  readonly destructive?: boolean;
  readonly onCancel: () => void;
  /** Devuelve el error de Better Auth, si hubo. */
  readonly onSubmit: (password: string) => Promise<Failure | undefined | null>;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<ConfirmPasswordInput>({
    resolver: contractResolver(ConfirmPasswordInputSchema),
    defaultValues: { password: '' },
  });

  async function submit(values: ConfirmPasswordInput) {
    setError(undefined);
    const failure = await onSubmit(values.password);
    if (failure) {
      setError(twoFactorSettingsError({ status: failure.status, code: failure.code }));
      form.resetField('password');
    }
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function CodeStep({
  onCancel,
  onSubmit,
}: {
  readonly onCancel: () => void;
  readonly onSubmit: (code: string) => Promise<Failure | undefined | null>;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<TwoFactorCodeInput>({
    resolver: contractResolver(TwoFactorCodeInputSchema),
    defaultValues: { code: '' },
  });

  async function submit(values: TwoFactorCodeInput) {
    setError(undefined);
    const failure = await onSubmit(values.code.trim());
    if (failure) {
      setError(twoFactorSettingsError({ status: failure.status, code: failure.code }));
      form.resetField('code');
    }
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código de la app</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  className="font-mono tracking-widest"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Activar
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function BackupCodes({ codes }: { readonly codes: readonly string[] }) {
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiaste los códigos');
    } catch {
      toast.error('No pudimos copiarlos. Seleccionalos y copialos a mano.');
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'norde-codigos-de-respaldo.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm select-all">
        {codes.map((code) => (
          <li key={code} className="text-center">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <CopyIcon className="h-4 w-4" />
          Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon className="h-4 w-4" />
          Descargar
        </Button>
      </div>
    </div>
  );
}
