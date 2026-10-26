'use client';

import { TwoFactorCodeInputSchema, type TwoFactorCodeInput } from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { Loader2Icon, ShieldCheckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { authClient } from '../../../lib/auth-client';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { twoFactorSignInError } from '../two-factor';

export interface TwoFactorChallengeProps {
  /** El código fue correcto: ya hay sesión. */
  readonly onSignedIn: () => void;
  /** Volver a la contraseña (el desafío venció o el usuario quiere empezar de nuevo). */
  readonly onRestart: (message?: string) => void;
}

type Method = 'totp' | 'backup-code';

/** Segundo paso del login: el código de la app autenticadora o uno de respaldo. */
export function TwoFactorChallenge({ onSignedIn, onRestart }: TwoFactorChallengeProps) {
  const trustId = useId();
  const [method, setMethod] = useState<Method>('totp');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const form = useForm<TwoFactorCodeInput>({
    resolver: contractResolver(TwoFactorCodeInputSchema),
    defaultValues: { code: '' },
  });

  async function submit(values: TwoFactorCodeInput) {
    setError(undefined);
    const code = values.code.trim();
    const { error: failure } =
      method === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (!failure) {
      onSignedIn();
      return;
    }
    const { message, restart } = twoFactorSignInError({
      status: failure.status,
      code: failure.code,
    });
    if (restart) {
      onRestart(message);
      return;
    }
    setError(message);
    form.resetField('code');
    form.setFocus('code');
  }

  function switchMethod() {
    setMethod(method === 'totp' ? 'backup-code' : 'totp');
    setError(undefined);
    form.reset({ code: '' });
  }

  const pending = form.formState.isSubmitting;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h1 className="font-body text-base font-semibold">Verificación en dos pasos</h1>
        </div>
        <p className="text-sm leading-normal text-muted-foreground">
          {method === 'totp'
            ? 'Abrí la app autenticadora de tu celular e ingresá el código de 6 dígitos.'
            : 'Ingresá uno de los códigos de respaldo que guardaste. Cada uno sirve una sola vez.'}
        </p>
      </header>

      <FormAlert message={error} />

      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
        >
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{method === 'totp' ? 'Código' : 'Código de respaldo'}</FormLabel>
                <FormControl>
                  <Input
                    {...(method === 'totp'
                      ? { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6 }
                      : { autoComplete: 'off', maxLength: 32 })}
                    autoFocus
                    className="font-mono tracking-widest"
                    {...field}
                  />
                </FormControl>
                {method === 'backup-code' && (
                  <FormDescription>Con el guion, por ejemplo abcde-12345.</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={trustId}
              checked={trustDevice}
              onCheckedChange={(checked) => {
                setTrustDevice(checked === true);
              }}
            />
            <Label htmlFor={trustId} className="font-normal">
              No pedir el código en este dispositivo por 30 días
            </Label>
          </div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Verificar
          </Button>
        </form>
      </Form>

      <div className="flex flex-col gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={switchMethod}>
          {method === 'totp'
            ? 'No tengo el celular: usar un código de respaldo'
            : 'Usar la app autenticadora'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onRestart();
          }}
        >
          Volver
        </Button>
      </div>

      <p className="text-xs leading-normal text-muted-foreground">
        ¿Perdiste el celular y los códigos? Pedile a un administrador que te quite la verificación
        en dos pasos.
      </p>
    </section>
  );
}
