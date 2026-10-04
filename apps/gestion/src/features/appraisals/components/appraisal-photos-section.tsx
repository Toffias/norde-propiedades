'use client';

import {
  APPRAISAL_PHOTO_TYPE_VALUES,
  MAX_APPRAISAL_PHOTO_BYTES,
  MAX_APPRAISAL_PHOTOS,
} from '@norde/core/appraisals/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { SectionCard } from '@norde/ui/components/section-card';
import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { runAction } from '../../../lib/action-result';
import { ConfirmActionDialog } from '../../shared/components/confirm-action-dialog';
import { deleteAppraisalPhotoAction, uploadAppraisalPhotoAction } from '../actions';
import { appraisalPhotoHref } from '../paths';

/** Fotos que se suben a la vez: el resto espera su turno. */
const UPLOAD_CONCURRENCY = 3;
const MAX_MB = Math.round(MAX_APPRAISAL_PHOTO_BYTES / (1024 * 1024));

interface Upload {
  readonly key: string;
  readonly name: string;
  readonly status: 'waiting' | 'uploading' | 'done' | 'failed';
  readonly error?: string;
}

const UPLOAD_STATUS_LABELS: Readonly<Record<Exclude<Upload['status'], 'failed'>, string>> = {
  waiting: 'En espera',
  uploading: 'Subiendo…',
  done: 'Subida',
};

/**
 * Las fotos de la visita: subir varias (con su avance) y borrar. Al convertir la tasación en
 * propiedad, se copian a su galería en este orden; la primera es la portada.
 */
export function AppraisalPhotosSection({
  appraisalId,
  photoIds,
  canEdit,
}: {
  readonly appraisalId: string;
  readonly photoIds: readonly string[];
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const [deleting, setDeleting] = useState<string | undefined>();
  const room = MAX_APPRAISAL_PHOTOS - photoIds.length;

  function upload(files: readonly File[]) {
    const queue = files.map((file, index) => ({
      key: `${Date.now().toString()}-${index.toString()}`,
      file,
    }));
    setUploads((current) => [
      ...current.filter((item) => item.status !== 'done'),
      ...queue.map(({ key, file }) => ({ key, name: file.name, status: 'waiting' as const })),
    ]);
    const update = (key: string, change: Partial<Upload>) => {
      setUploads((current) =>
        current.map((item) => (item.key === key ? { ...item, ...change } : item)),
      );
    };
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return;
        update(next.key, { status: 'uploading' });
        const form = new FormData();
        form.set('appraisalId', appraisalId);
        form.set('file', next.file);
        const error = await runAction(() => uploadAppraisalPhotoAction(form));
        update(next.key, error === undefined ? { status: 'done' } : { status: 'failed', error });
      }
    };
    void Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker)).then(() => {
      router.refresh();
    });
  }

  const allowed = (file: File) =>
    APPRAISAL_PHOTO_TYPE_VALUES.some((type) => type === file.type) &&
    file.size <= MAX_APPRAISAL_PHOTO_BYTES;

  return (
    <SectionCard title={`Fotos (${photoIds.length.toString()})`}>
      <div className="flex flex-col gap-4">
        {canEdit && room > 0 && (
          <FileDropzone
            multiple
            accept={APPRAISAL_PHOTO_TYPE_VALUES.join(',')}
            title="Arrastrá las fotos de la visita o hacé clic para elegirlas"
            hint={`JPG, PNG o WebP, hasta ${MAX_MB.toString()} MB cada una. Hasta ${MAX_APPRAISAL_PHOTOS.toString()} fotos.`}
            onFiles={(files) => {
              const rejected = files.filter((file) => !allowed(file));
              if (rejected.length > 0) {
                toast.error(
                  `No se suben ${rejected.length.toString()} archivos: tienen que ser fotos JPG, PNG o WebP de hasta ${MAX_MB.toString()} MB.`,
                );
              }
              const accepted = files.filter(allowed);
              if (accepted.length > room) {
                toast.error(`Entran ${room.toString()} fotos más: se suben las primeras.`);
              }
              if (accepted.length > 0) upload(accepted.slice(0, room));
            }}
          />
        )}
        {uploads.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
            {uploads.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                {(item.status === 'uploading' || item.status === 'waiting') && (
                  <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <span className="truncate">{item.name}</span>
                <span
                  className={cn(
                    'text-xs',
                    item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {item.status === 'failed' ? item.error : UPLOAD_STATUS_LABELS[item.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {photoIds.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay fotos de la visita.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photoIds.map((photoId, index) => (
              <li
                key={photoId}
                className="relative overflow-hidden rounded-lg border border-border bg-muted"
              >
                <a
                  href={appraisalPhotoHref(appraisalId, photoId)}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-[4/3] w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel */}
                  <img
                    src={appraisalPhotoHref(appraisalId, photoId)}
                    alt={`Foto ${(index + 1).toString()} de la visita`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
                {index === 0 && (
                  <div className="absolute top-1.5 left-1.5">
                    <Badge>Portada</Badge>
                  </div>
                )}
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    className="absolute top-1.5 right-1.5"
                    aria-label={`Borrar la foto ${(index + 1).toString()}`}
                    onClick={() => {
                      setDeleting(photoId);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {photoIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Al convertirla en propiedad, las fotos pasan a su galería en este orden.
          </p>
        )}
      </div>
      <ConfirmActionDialog
        copy={
          deleting === undefined
            ? undefined
            : {
                title: 'Borrar foto',
                description: 'La foto se borra de la tasación. No se puede deshacer.',
                confirm: 'Borrar',
                done: 'Foto borrada',
                destructive: true,
              }
        }
        run={() => deleteAppraisalPhotoAction({ appraisalId, photoId: deleting ?? '' })}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </SectionCard>
  );
}
