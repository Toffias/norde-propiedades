'use client';

import { LOGO_CONTENT_TYPES, MAX_LOGO_BYTES } from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { changeLogoAction } from '../actions';

export interface LogoUploaderProps {
  readonly which: 'company' | 'watermark';
  readonly hasLogo: boolean;
  /** Versión de la imagen, para que el navegador no muestre la anterior después de cambiarla. */
  readonly version: string;
  readonly disabled: boolean;
  /** Quitar el logo de la marca de agua requiere desactivarla antes. */
  readonly removable?: boolean;
}

/** Logo actual, con subir uno nuevo (PNG, JPG o WebP de hasta 2 MB) y quitarlo. */
export function LogoUploader({
  which,
  hasLogo,
  version,
  disabled,
  removable = true,
}: LogoUploaderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function change(file: File | undefined) {
    setError(undefined);
    if (file && !LOGO_CONTENT_TYPES.some((type) => type === file.type)) {
      setError('Subí una imagen PNG, JPG o WebP.');
      return;
    }
    if (file && file.size > MAX_LOGO_BYTES) {
      setError('La imagen supera los 2 MB.');
      return;
    }
    const form = new FormData();
    if (file) form.set('image', file);
    startTransition(async () => {
      const message = await runAction(() => changeLogoAction(which, form));
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(file ? 'Logo actualizado' : 'Logo quitado');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Damero con los tokens del tema: un logo blanco o transparente se ve en los dos temas. */}
        <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,var(--color-border)_0%_50%)] bg-size-[16px_16px]">
          {hasLogo ? (
            // Imagen servida por el panel (autorizada por el caso de uso), no por un CDN.
            // eslint-disable-next-line @next/next/no-img-element -- `next/image` no sirve para una ruta que exige sesión.
            <img
              src={`/mi-empresa/logo/${which}?v=${encodeURIComponent(version)}`}
              alt={which === 'company' ? 'Logo de la empresa' : 'Logo de la marca de agua'}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Sin logo</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <FileDropzone
            accept={LOGO_CONTENT_TYPES.join(',')}
            disabled={disabled || pending}
            title={hasLogo ? 'Cambiar el logo' : 'Subir el logo'}
            hint="PNG, JPG o WebP, hasta 2 MB. Mejor con fondo transparente."
            onFiles={(files) => {
              change(files[0]);
            }}
          />
          {hasLogo && removable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={disabled || pending}
              onClick={() => {
                change(undefined);
              }}
            >
              {pending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Quitar el logo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
