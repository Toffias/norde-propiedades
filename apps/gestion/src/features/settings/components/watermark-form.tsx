'use client';

import {
  ConfigureWatermarkInputSchema,
  LOGO_CONTENT_TYPES,
  MAX_PREVIEW_IMAGE_BYTES,
  type CompanySettingsView,
  type ConfigureWatermarkInput,
  type WatermarkPositionValue,
} from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { EyeIcon, Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { FormAlert } from '../../shared/components/form-alert';
import { configureWatermarkAction, previewWatermarkAction } from '../actions';

const POSITIONS: readonly (readonly [WatermarkPositionValue, string])[] = [
  ['top-left', 'Arriba a la izquierda'],
  ['top-center', 'Arriba al centro'],
  ['top-right', 'Arriba a la derecha'],
  ['middle-left', 'Al medio a la izquierda'],
  ['center', 'Al centro'],
  ['middle-right', 'Al medio a la derecha'],
  ['bottom-left', 'Abajo a la izquierda'],
  ['bottom-center', 'Abajo al centro'],
  ['bottom-right', 'Abajo a la derecha'],
];

export function WatermarkForm({
  watermark,
  disabled,
}: {
  readonly watermark: CompanySettingsView['watermark'];
  readonly disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | undefined>();
  const [previewing, startPreview] = useTransition();
  const form = useForm<ConfigureWatermarkInput>({
    resolver: contractResolver(ConfigureWatermarkInputSchema),
    defaultValues: {
      enabled: watermark.enabled,
      sizePercent: watermark.sizePercent,
      position: watermark.position,
      opacity: watermark.opacity,
    },
  });

  async function submit(values: ConfigureWatermarkInput) {
    setError(undefined);
    const message = await runAction(() => configureWatermarkAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Marca de agua guardada');
    router.refresh();
  }

  function previewOn(photo: File | undefined) {
    if (!photo) return;
    setError(undefined);
    if (!LOGO_CONTENT_TYPES.some((type) => type === photo.type)) {
      setError('Para la vista previa subí una foto JPG, PNG o WebP.');
      return;
    }
    if (photo.size > MAX_PREVIEW_IMAGE_BYTES) {
      setError('La foto de muestra supera los 10 MB.');
      return;
    }
    const values = form.getValues();
    const data = new FormData();
    data.set('photo', photo);
    data.set('sizePercent', String(values.sizePercent));
    data.set('position', values.position);
    data.set('opacity', String(values.opacity));
    startPreview(async () => {
      try {
        const result = await previewWatermarkAction(data);
        if (result.ok) setPreview(result.dataUrl);
        else setError(result.message);
      } catch {
        // La excepción ya quedó logueada en el servidor.
        setError('No pudimos generar la vista previa. Probá de nuevo.');
      }
    });
  }

  const pending = form.formState.isSubmitting;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
        >
          <FormAlert message={error} />
          <fieldset disabled={disabled || pending} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Aplicar la marca de agua</FormLabel>
                    <FormDescription>
                      En las fotos que se publican en portales y en los PDF. Las originales no se
                      modifican.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled || !watermark.hasLogo}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Posición</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {POSITIONS.map(([value, label]) => (
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
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sizePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tamaño (% del ancho)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={5}
                        max={50}
                        inputMode="numeric"
                        {...field}
                        value={String(field.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="opacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opacidad (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        inputMode="numeric"
                        {...field}
                        value={String(field.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </fieldset>
          {!disabled && (
            <Button type="submit" className="self-start" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </form>
      </Form>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <EyeIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          Vista previa
        </div>
        <FileDropzone
          accept={LOGO_CONTENT_TYPES.join(',')}
          disabled={!watermark.hasLogo || previewing}
          title="Probá con una foto"
          hint={
            watermark.hasLogo
              ? 'Usa los valores del formulario, aunque no estén guardados. No se guarda nada.'
              : 'Primero subí el logo de la marca de agua.'
          }
          onFiles={(files) => {
            previewOn(files[0]);
          }}
        />
        {previewing && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" /> Generando la vista previa…
          </p>
        )}
        {preview !== undefined && !previewing && (
          // Imagen generada en el servidor (data URL): `next/image` no aporta acá.
          // eslint-disable-next-line @next/next/no-img-element -- data URL de la vista previa.
          <img
            src={preview}
            alt="Foto de muestra con la marca de agua"
            className="w-full rounded-md border border-border"
          />
        )}
      </div>
    </div>
  );
}
