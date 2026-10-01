'use client';

import {
  UpdatePdfOptionsInputSchema,
  type AddressDisplayValue,
  type UpdatePdfOptionsInput,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { updatePdfOptionsAction } from '../actions';

const ADDRESS_LABELS: readonly (readonly [AddressDisplayValue, string])[] = [
  ['full', 'La dirección exacta'],
  ['approximate', 'Solo la calle y el barrio'],
  ['hidden', 'No mostrarla'],
];

type Toggle = Extract<
  FieldPath<UpdatePdfOptionsInput>,
  'showCompanyContact' | 'showAgent' | 'showPrice' | 'developmentPhotosInUnits'
>;

const TOGGLES: readonly (readonly [Toggle, string, string])[] = [
  [
    'showCompanyContact',
    'Datos de contacto de la empresa',
    'Teléfono, email y dirección de la sucursal.',
  ],
  ['showAgent', 'Datos del agente', 'Nombre, teléfono y email de quien envía o descarga la ficha.'],
  ['showPrice', 'Precio', 'Si se apaga, la ficha dice "Consultar precio".'],
  [
    'developmentPhotosInUnits',
    'Fotos del emprendimiento en las unidades',
    'La ficha de cada unidad suma las fotos del emprendimiento.',
  ],
];

export function PdfOptionsForm({
  options,
  disabled,
}: {
  readonly options: UpdatePdfOptionsInput;
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdatePdfOptionsInput>({
    resolver: contractResolver(UpdatePdfOptionsInputSchema),
    defaultValues: options,
  });

  async function submit(values: UpdatePdfOptionsInput) {
    setError(undefined);
    const message = await runAction(() => updatePdfOptionsAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Opciones de la ficha guardadas');
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
        <div className="grid gap-3 md:grid-cols-2">
          {TOGGLES.map(([name, label, description]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>{label}</FormLabel>
                    <FormDescription>{description}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled || pending}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['addressOnSend', 'Dirección al enviar la ficha a un cliente'],
              ['addressOnDownload', 'Dirección al descargarla desde el panel'],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled || pending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ADDRESS_LABELS.map(([value, text]) => (
                        <SelectItem key={value} value={value}>
                          {text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
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
