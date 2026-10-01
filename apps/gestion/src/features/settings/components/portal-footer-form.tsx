'use client';

import {
  FOOTER_VARIABLE_VALUES,
  UpdatePortalDescriptionFooterInputSchema,
  type UpdatePortalDescriptionFooterInput,
} from '@norde/core/settings/contracts';
import { Badge } from '@norde/ui/components/badge';
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
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { updatePortalDescriptionFooterAction } from '../actions';

const VARIABLE_LABELS: Readonly<Record<(typeof FOOTER_VARIABLE_VALUES)[number], string>> = {
  codigo: 'Código de referencia',
  telefono_sucursal: 'Teléfono de la sucursal',
  email_sucursal: 'Email de la sucursal',
  whatsapp_sucursal: 'WhatsApp de la sucursal',
  url_web: 'Link a la ficha en la web',
};

export function PortalFooterForm({
  footer,
  disabled,
}: {
  readonly footer: string | undefined;
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdatePortalDescriptionFooterInput>({
    resolver: contractResolver(UpdatePortalDescriptionFooterInputSchema),
    defaultValues: { footer: footer ?? '' },
  });

  async function submit(values: UpdatePortalDescriptionFooterInput) {
    setError(undefined);
    const message = await runAction(() =>
      updatePortalDescriptionFooterAction({ footer: values.footer ?? '' }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Pie de descripción guardado');
    router.refresh();
  }

  function insert(variable: string) {
    const current = form.getValues('footer') ?? '';
    form.setValue(
      'footer',
      `${current}${current === '' || current.endsWith(' ') ? '' : ' '}{${variable}}`,
      {
        shouldDirty: true,
      },
    );
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
          name="footer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pie de la descripción</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  disabled={disabled || pending}
                  placeholder="Código {codigo}. Consultas al {telefono_sucursal}."
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                Se agrega al final de la descripción de cada propiedad publicada en portales. Vacío,
                no se agrega nada.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Variables</span>
          <div className="flex flex-wrap gap-2">
            {FOOTER_VARIABLE_VALUES.map((variable) => (
              <button
                key={variable}
                type="button"
                disabled={disabled || pending}
                className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                onClick={() => {
                  insert(variable);
                }}
              >
                <Badge variant="outline" title={VARIABLE_LABELS[variable]}>
                  {`{${variable}}`}
                </Badge>
              </button>
            ))}
          </div>
        </div>
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
