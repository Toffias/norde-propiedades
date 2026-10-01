'use client';

import {
  ChangeOwnPasswordInputSchema,
  type ChangeOwnPasswordInput,
} from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { PasswordInput } from '@norde/ui/components/password-input';
import { toast } from '@norde/ui/components/sonner';
import { KeyRoundIcon, Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { authClient } from '../../../lib/auth-client';
import { contractResolver } from '../../../lib/form';
import { changeOwnPasswordAction } from '../actions';
import { FormAlert } from '../../shared/components/form-alert';

export function ChangePasswordForm({ temporary }: { readonly temporary: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<ChangeOwnPasswordInput>({
    resolver: contractResolver(ChangeOwnPasswordInputSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  async function submit(values: ChangeOwnPasswordInput) {
    setError(undefined);
    const message = await runAction(() => changeOwnPasswordAction(values));
    if (message !== undefined) {
      setError(message);
      form.resetField('currentPassword');
      return;
    }
    toast.success('Listo, ya tenés tu contraseña');
    router.replace('/');
    router.refresh();
  }

  async function signOut() {
    await authClient.signOut();
    router.replace('/ingresar');
    router.refresh();
  }

  const pending = form.formState.isSubmitting;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h1 className="font-body text-base font-semibold">Elegí tu contraseña</h1>
        </div>
        <p className="text-sm leading-normal text-muted-foreground">
          {temporary
            ? 'Entraste con una contraseña temporal. Antes de seguir, elegí una que solo sepas vos.'
            : 'Cambiá tu contraseña del panel.'}
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
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{temporary ? 'Contraseña temporal' : 'Contraseña actual'}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contraseña nueva</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>Al menos 10 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar contraseña
          </Button>
        </form>
      </Form>

      <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
        Salir
      </Button>
    </section>
  );
}
