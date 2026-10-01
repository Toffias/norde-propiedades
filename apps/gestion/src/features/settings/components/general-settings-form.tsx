'use client';

import {
  UpdateGeneralSettingsInputSchema,
  type CompanySettingsView,
  type UpdateGeneralSettingsInput,
} from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { updateGeneralSettingsAction } from '../actions';

/** Zonas horarias de Argentina, más UTC. La de Buenos Aires es la de fábrica. */
const TIMEZONES = [
  ['America/Argentina/Buenos_Aires', 'Buenos Aires (GMT-3)'],
  ['America/Argentina/Cordoba', 'Córdoba'],
  ['America/Argentina/Salta', 'Salta'],
  ['America/Argentina/Jujuy', 'Jujuy'],
  ['America/Argentina/Tucuman', 'Tucumán'],
  ['America/Argentina/Catamarca', 'Catamarca'],
  ['America/Argentina/La_Rioja', 'La Rioja'],
  ['America/Argentina/San_Juan', 'San Juan'],
  ['America/Argentina/Mendoza', 'Mendoza'],
  ['America/Argentina/San_Luis', 'San Luis'],
  ['America/Argentina/Rio_Gallegos', 'Río Gallegos'],
  ['America/Argentina/Ushuaia', 'Ushuaia'],
  ['UTC', 'UTC'],
] as const;

export function GeneralSettingsForm({
  settings,
  disabled,
}: {
  readonly settings: CompanySettingsView;
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdateGeneralSettingsInput>({
    resolver: contractResolver(UpdateGeneralSettingsInputSchema),
    defaultValues: {
      name: settings.name,
      timezone: settings.timezone,
      // Las URLs de la web no se editan desde el panel por ahora: se reenvían tal cual para no pisarlas.
      webPropertyUrlTemplate: settings.webPropertyUrlTemplate ?? '',
      webDevelopmentUrlTemplate: settings.webDevelopmentUrlTemplate ?? '',
      newsScope: settings.newsScope,
    },
  });

  async function submit(values: UpdateGeneralSettingsInput) {
    setError(undefined);
    const message = await runAction(() => updateGeneralSettingsAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Configuración guardada');
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la empresa</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zona horaria</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIMEZONES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newsScope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Noticias</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="all">Cada agente ve las de todas las sucursales</SelectItem>
                    <SelectItem value="branch">Cada agente ve las de su sucursal</SelectItem>
                  </SelectContent>
                </Select>
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
