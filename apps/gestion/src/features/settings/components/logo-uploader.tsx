'use client';

import { LOGO_CONTENT_TYPES, MAX_LOGO_BYTES } from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, Trash2Icon, UploadIcon } from 'lucide-react';
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

/** Logo actual, con subir uno nuevo (PNG, JPG o WebP de hasta 2 MB) en un modal y quitarlo. */
export function LogoUploader({
  which,
  hasLogo,
  version,
  disabled,
  removable = true,
}: LogoUploaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      toast.success(file ? 'Logo actualizado' : 'Logo quitado');
      router.refresh();
    });
  }

  function toggle(next: boolean) {
    if (pending) return;
    setError(undefined);
    setOpen(next);
  }

  const uploadTitle = hasLogo ? 'Cambiar el logo' : 'Subir el logo';

  return (
    <div className="flex flex-col gap-3">
      {!open && <FormAlert message={error} />}
      <div className="flex w-fit flex-col gap-3">
        {/* Damero con los tokens del tema: un logo blanco o transparente se ve en los dos temas. */}
        <div className="flex h-24 w-full min-w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,var(--color-border)_0%_50%)] bg-size-[16px_16px]">
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
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                toggle(true);
              }}
            >
              <UploadIcon className="h-4 w-4" />
              {uploadTitle}
            </Button>
            {hasLogo && removable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  change(undefined);
                }}
              >
                {pending && !open ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2Icon className="h-4 w-4" />
                )}
                Quitar el logo
              </Button>
            )}
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={toggle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uploadTitle}</DialogTitle>
            <DialogDescription>
              Mejor con fondo transparente, para que se vea bien sobre cualquier color.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <FileDropzone
            accept={LOGO_CONTENT_TYPES.join(',')}
            disabled={pending}
            title={pending ? 'Subiendo…' : 'Arrastrá la imagen o hacé click para elegirla'}
            hint="PNG, JPG o WebP, hasta 2 MB."
            onFiles={(files) => {
              change(files[0]);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
