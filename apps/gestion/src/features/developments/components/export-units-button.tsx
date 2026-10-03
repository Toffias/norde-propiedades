'use client';

import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';

const ATTACHMENT_NAME = /filename="([^"]+)"/;

/** Pide el Excel de unidades y lo descarga. Un error esperado vuelve como JSON con su mensaje. */
async function download(developmentId: string) {
  const response = await fetch(`/emprendimientos/${developmentId}/unidades/exportar`, {
    method: 'POST',
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : UNEXPECTED_ERROR_MESSAGE;
    throw new Error(message);
  }
  const name =
    ATTACHMENT_NAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'unidades.xlsx';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** "Descargar unidades": el Excel con las columnas que después se pueden volver a importar. */
export function ExportUnitsButton({
  developmentId,
  label = 'Exportar a Excel',
  ...props
}: {
  readonly developmentId: string;
  readonly label?: string;
} & Pick<ComponentProps<typeof Button>, 'variant' | 'size' | 'className'>) {
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      await download(developmentId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      {...props}
      disabled={pending}
      onClick={() => void run()}
    >
      {pending ? (
        <Loader2Icon className="h-4 w-4 animate-spin" />
      ) : (
        <DownloadIcon className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
