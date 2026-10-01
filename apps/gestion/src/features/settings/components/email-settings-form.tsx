'use client';

import {
  SendTestEmailInputSchema,
  UpdateEmailSenderInputSchema,
  type CompanySettingsView,
  type SendTestEmailInput,
  type UpdateEmailSenderInput,
} from '@norde/core/settings/contracts';
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
import { Input } from '@norde/ui/components/input';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { sendTestEmailAction, updateEmailSenderAction } from '../actions';

export function EmailSenderForm({
  sender,
  disabled,
}: {
  readonly sender: CompanySettingsView['emailSender'];
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdateEmailSenderInput>({
    resolver: contractResolver(UpdateEmailSenderInputSchema),
    defaultValues: { fromName: sender.fromName ?? '', replyTo: sender.replyTo ?? '' },
  });

  async function submit(values: UpdateEmailSenderInput) {
    setError(undefined);
    const message = await runAction(() => updateEmailSenderAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Remitente guardado');
    router.refresh();
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
        <fieldset disabled={disabled || pending} className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="fromName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del remitente</FormLabel>
                <FormControl>
                  <Input placeholder="Norde Propiedades" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Sin nombre, se usa el de la empresa.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="replyTo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Responder a</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="consultas@norde.com.ar"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Adonde llegan las respuestas de los clientes.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        {!disabled && (
          <Button type="submit" className="self-start" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        )}
      </form>
    </Form>
  );
}

export function TestEmailForm({ disabled }: { readonly disabled: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<SendTestEmailInput>({
    resolver: contractResolver(SendTestEmailInputSchema),
    defaultValues: { to: '' },
  });

  async function submit(values: SendTestEmailInput) {
    setError(undefined);
    const message = await runAction(() => sendTestEmailAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Email de prueba enviado', { description: 'Revisá la bandeja de entrada.' });
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <FormField
            control={form.control}
            name="to"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel className="sr-only">Enviar la prueba a</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="tu-email@norde.com.ar"
                    disabled={disabled || pending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" variant="outline" disabled={disabled || pending}>
            {pending ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
            Enviar prueba
          </Button>
        </div>
      </form>
    </Form>
  );
}
