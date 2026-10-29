'use client';

import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { cn } from '@norde/ui/lib/utils';
import { CheckIcon, ImagePlusIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** Una foto elegida en el modal y cómo va su subida. */
export interface PhotoUploadProgress {
  readonly key: string;
  readonly name: string;
  readonly state: 'pending' | 'done' | 'failed';
  /** Lo que se muestra al lado del nombre: "Subiendo…", "Subida" o el error. */
  readonly label: string;
}

/** El botón "Agregar fotos" de la cabecera de una tarjeta de fotos. */
export function AddPhotosButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <ImagePlusIcon className="h-4 w-4" />
      Agregar fotos
    </Button>
  );
}

/**
 * El modal para subir fotos: la zona para soltarlas o elegirlas y el avance de cada una. Se cierra
 * solo cuando terminan de subirse todas bien; si alguna falla, queda abierto con el error.
 */
export function PhotoUploadDialog({
  open,
  onOpenChange,
  accept,
  title = 'Agregar fotos',
  hint,
  progress,
  onFiles,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly accept: string;
  readonly title?: string;
  readonly hint: string;
  /** Las fotos elegidas desde que se abrió el modal. */
  readonly progress: readonly PhotoUploadProgress[];
  readonly onFiles: (files: readonly File[]) => void;
}) {
  const uploading = progress.some((item) => item.state === 'pending');
  const failed = progress.some((item) => item.state === 'failed');
  const wasUploading = useRef(false);

  useEffect(() => {
    if (wasUploading.current && !uploading && !failed && progress.length > 0) {
      onOpenChange(false);
    }
    wasUploading.current = uploading;
  }, [uploading, failed, progress.length, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle icon={ImagePlusIcon}>{title}</DialogTitle>
          <DialogDescription>
            Podés cerrar el modal mientras se suben: siguen subiéndose y aparecen en la galería.
          </DialogDescription>
        </DialogHeader>
        <FileDropzone
          multiple
          accept={accept}
          title="Arrastrá las fotos o hacé clic para elegirlas"
          hint={hint}
          onFiles={onFiles}
        />
        {progress.length > 0 && (
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto text-sm" aria-live="polite">
            {progress.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                {item.state === 'pending' ? (
                  <Loader2Icon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : item.state === 'done' ? (
                  <CheckIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span
                  className={cn(
                    'text-xs',
                    item.state === 'failed'
                      ? 'max-w-[60%] text-right text-destructive'
                      : 'shrink-0 text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {uploading ? 'Seguir en segundo plano' : 'Cerrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
