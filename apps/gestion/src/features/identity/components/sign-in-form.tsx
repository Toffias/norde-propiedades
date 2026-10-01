'use client';

import { SignInInputSchema, type SignInInput } from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { PasswordInput } from '@norde/ui/components/password-input';
import { AlertTriangleIcon, Loader2Icon, LogInIcon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { authClient } from '../../../lib/auth-client';
import { contractResolver } from '../../../lib/form';
import { signInErrorMessage } from '../sign-in';

export interface SignInFormProps {
  /** Ruta del panel a la que volver (ya validada con `safeReturnPath`). */
  readonly returnTo: string;
  /** Se volvió al login porque el usuario quedó suspendido con la sesión abierta. */
  readonly suspended: boolean;
}

export function SignInForm({ returnTo, suspended }: SignInFormProps) {
  const router = useRouter();
  const rememberId = useId();
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | undefined>(
    suspended ? 'Tu usuario no tiene acceso al panel. Hablá con un administrador.' : undefined,
  );
  const form = useForm<SignInInput>({
    resolver: contractResolver(SignInInputSchema),
    defaultValues: { email: '', password: '' },
  });

  // La sesión de un usuario suspendido sigue en la cookie: se cierra para no rebotar otra vez.
  useEffect(() => {
    if (suspended) void authClient.signOut();
  }, [suspended]);

  async function submit(values: SignInInput) {
    setError(undefined);
    const { error: failure } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: remember,
    });
    if (failure) {
      setError(signInErrorMessage({ status: failure.status, code: failure.code }));
      form.resetField('password');
      return;
    }
    // Ruta del panel validada por `safeReturnPath`: typedRoutes no puede verificar un string.
    router.replace(returnTo as Route);
    router.refresh();
  }

  const pending = form.formState.isSubmitting;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <LogInIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h1 className="font-body text-base font-semibold">Ingresar</h1>
        </div>
        <p className="text-sm leading-normal text-muted-foreground">
          Usá el email con el que te dieron de alta en Norde.
        </p>
      </header>

      {error !== undefined && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contraseña</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={rememberId}
              checked={remember}
              onCheckedChange={(checked) => {
                setRemember(checked === true);
              }}
            />
            <Label htmlFor={rememberId} className="font-normal">
              Recordarme en este dispositivo
            </Label>
          </div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Ingresar
          </Button>
        </form>
      </Form>

      <p className="text-xs leading-normal text-muted-foreground">
        ¿Te olvidaste la contraseña? Pedile a un administrador que te la blanquee.
      </p>
    </section>
  );
}
