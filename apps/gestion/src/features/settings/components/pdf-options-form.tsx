'use client';

import {
  UpdatePdfOptionsInputSchema,
  type AddressDisplayValue,
  type AgentInfoModeValue,
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
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { updatePdfOptionsAction } from '../actions';

/** El rojo de Norde: el color de marca de fábrica. */
const DEFAULT_BRAND_COLOR = '#c9302b';

const CONTACT_PLACEHOLDER = ['Av. Cabildo 1234, CABA', 'Lunes a viernes de 9 a 18'].join('\n');

const ADDRESS_LABELS: readonly (readonly [AddressDisplayValue, string])[] = [
  ['full', 'La dirección exacta'],
  ['approximate', 'Solo la calle y el barrio'],
  ['hidden', 'No mostrarla'],
];

const AGENT_LABELS: readonly (readonly [AgentInfoModeValue, string])[] = [
  ['show', 'Mostrarlos siempre'],
  ['hide', 'No mostrarlos'],
  ['ask', 'Preguntar al armar el PDF'],
];

type Toggle = Extract<
  FieldPath<UpdatePdfOptionsInput>,
  'showCompanyContact' | 'showPrice' | 'developmentPhotosInUnits'
>;

const TOGGLES: readonly (readonly [Toggle, string, string])[] = [
  [
    'showCompanyContact',
    'Datos de contacto de la empresa',
    'Teléfono, email y dirección de la sucursal, o el texto libre de abajo.',
  ],
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
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="agentInfo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Datos del agente</FormLabel>
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
                    {AGENT_LABELS.map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Nombre, teléfono y email de quien arma la ficha.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="contactText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contacto en texto libre (opcional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    disabled={disabled || pending}
                    placeholder={CONTACT_PLACEHOLDER}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  Hasta 6 renglones. Reemplaza a la dirección, los teléfonos y el email de la
                  sucursal en todos los PDF. Una sucursal con su propio texto usa el suyo.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="brandColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color de marca</FormLabel>
                <div className="flex items-center gap-3">
                  <FormControl>
                    <input
                      type="color"
                      value={field.value}
                      disabled={disabled || pending}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                      }}
                      onBlur={field.onBlur}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5 disabled:cursor-not-allowed"
                    />
                  </FormControl>
                  <span className="font-mono text-sm uppercase">{field.value}</span>
                  {!disabled && field.value.toLowerCase() !== DEFAULT_BRAND_COLOR && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        field.onChange(DEFAULT_BRAND_COLOR);
                      }}
                    >
                      <RotateCcwIcon className="size-3.5" aria-hidden />
                      El de Norde
                    </Button>
                  )}
                </div>
                <FormDescription>
                  Títulos, badges e íconos de todos los PDF. Tiene que leerse sobre blanco: los
                  colores muy claros no se aceptan.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
