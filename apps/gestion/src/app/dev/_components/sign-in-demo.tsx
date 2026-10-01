'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { PasswordInput } from '@norde/ui/components/password-input';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, LogInIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Schema SOLO de la demo: cuando exista el módulo identity, el formulario real usa su contract.
const DemoSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean(),
});

type DemoSignIn = z.infer<typeof DemoSignInSchema>;

/** Patrón de pantalla pública: sin card, encabezado discreto y botón a ancho completo. */
export function SignInDemo() {
  const [pending, setPending] = useState(false);
  const form = useForm<DemoSignIn>({
    resolver: zodResolver(DemoSignInSchema),
    defaultValues: { email: '', password: '', remember: true },
  });

  async function submit() {
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setPending(false);
    toast.error('Email o contraseña incorrectos', {
      description: 'Demo: el ingreso llega con el módulo de usuarios.',
    });
  }

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
                  <Input type="email" autoComplete="email" {...field} />
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
                <div className="flex items-center justify-between gap-2">
                  <FormLabel>Contraseña</FormLabel>
                  <a
                    href="#recuperar"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="remember"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                    }}
                  />
                </FormControl>
                <FormLabel className="font-normal">Recordarme</FormLabel>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Ingresar
          </Button>
        </form>
      </Form>
    </section>
  );
}
