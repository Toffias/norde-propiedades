'use client';

import type { AppraisalFilter } from '@norde/core/appraisals/contracts';
import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';

const ATTACHMENT_NAME = /filename="([^"]+)"/;

/** Pide la exportación y la descarga. Un error esperado vuelve como JSON con su mensaje. */
async function download(filter: AppraisalFilter) {
  const response = await fetch('/tasaciones/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter }),
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
    ATTACHMENT_NAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    'tasaciones.xlsx';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** "Exportar a Excel": las tasaciones que cumplen los filtros aplicados, con los valores tasados. */
export function ExportAppraisalsButton({
  filter,
  disabled,
}: {
  /** Viaja el filtro, nunca la lista de tasaciones. */
  readonly filter: AppraisalFilter;
  readonly disabled: boolean;
}) {
  const [exporting, startExport] = useTransition();

  function run() {
    startExport(async () => {
      const toastId = toast.loading('Preparando la planilla…');
      try {
        await download(filter);
        toast.success('Exportación lista', { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE, {
          id: toastId,
        });
      }
    });
  }

  return (
    <Button type="button" variant="outline" disabled={exporting || disabled} onClick={run}>
      {exporting ? (
        <Loader2Icon className="h-4 w-4 animate-spin" />
      ) : (
        <DownloadIcon className="h-4 w-4" />
      )}
      Exportar a Excel
    </Button>
  );
}
