'use client';

import type {
  PropertyDocumentKindValue,
  PropertyDocumentRow,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { Textarea } from '@norde/ui/components/textarea';
import { DownloadIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { formatDateOnly, formatDateTime } from '../../../../lib/format';
import { FormAlert } from '../../../shared/components/form-alert';
import {
  loadPropertyDocumentsAction,
  requestPropertyDocumentAction,
  sendOwnerReportAction,
} from '../../detail-actions';
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_DISPLAY } from '../../detail-labels';

/** Cada cuánto se vuelve a preguntar mientras algún PDF se está armando. */
const POLL_MS = 3000;

/** `AAAA-MM-DD` de hoy y de hace un mes, en Buenos Aires, para el período por defecto. */
function defaultPeriod(): { readonly from: string; readonly to: string } {
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: day(monthAgo), to: day(today) };
}

/** Pide un PDF y avisa que se está armando. */
export function useRequestDocument(propertyId: string, onRequested: () => void) {
  const [pending, startTransition] = useTransition();
  const request = (kind: Exclude<PropertyDocumentKindValue, 'owner_report'>) => {
    startTransition(async () => {
      const error = await runAction(() => requestPropertyDocumentAction({ propertyId, kind }));
      if (error !== undefined) {
        toast.error(error);
        return;
      }
      toast.success(`Estamos armando el ${DOCUMENT_KIND_LABELS[kind].toLowerCase()}.`);
      onRequested();
    });
  };
  return { request, pending };
}

/** Los PDF pedidos de la ficha, con su estado; se actualiza solo mientras alguno se arma. */
export function DocumentsDialog({
  propertyId,
  open,
  onOpenChange,
}: {
  readonly propertyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [documents, setDocuments] = useState<readonly PropertyDocumentRow[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState<PropertyDocumentRow | undefined>();

  const load = useCallback(async () => {
    const result = await loadPropertyDocumentsAction(propertyId);
    if (result.ok) {
      setDocuments(result.value);
      setError(undefined);
    } else {
      setError(result.message);
    }
  }, [propertyId]);

  // Mientras el diálogo está abierto: una consulta al abrir y después cada unos segundos.
  useEffect(() => {
    if (!open) return undefined;
    const first = setTimeout(() => {
      void load();
    }, 0);
    const timer = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [open, load]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>PDF de la propiedad</DialogTitle>
            <DialogDescription>
              Los últimos pedidos. Un PDF tarda unos segundos en armarse: esta lista se actualiza
              sola.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          {documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no se pidió ningún PDF.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {documents.map((document) => {
                const status = DOCUMENT_STATUS_DISPLAY[document.status];
                return (
                  <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{DOCUMENT_KIND_LABELS[document.kind]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(document.createdAt)}
                        {document.requestedBy.name === undefined
                          ? ''
                          : ` · ${document.requestedBy.name}`}
                        {document.period === undefined
                          ? ''
                          : ` · del ${formatDateOnly(document.period.from)} al ${formatDateOnly(document.period.to)}`}
                      </p>
                      {document.error !== undefined && (
                        <p className="text-xs text-destructive">{document.error}</p>
                      )}
                    </div>
                    <StatusPill tone={status.tone}>
                      {document.status === 'pending' && (
                        <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
                      )}
                      {status.label}
                    </StatusPill>
                    {document.status === 'ready' && (
                      <div className="flex gap-1">
                        {document.kind === 'owner_report' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSending(document);
                            }}
                          >
                            <SendIcon className="h-4 w-4" />
                            Enviar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/propiedades/${propertyId}/documentos/${document.id}`}>
                            <DownloadIcon className="h-4 w-4" />
                            Descargar
                          </a>
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {sending !== undefined && (
        <SendOwnerReportDialog
          propertyId={propertyId}
          document={sending}
          onClose={() => {
            setSending(undefined);
          }}
        />
      )}
    </>
  );
}

/** Pide el reporte al propietario de un período. */
export function OwnerReportDialog({
  propertyId,
  open,
  onOpenChange,
  onRequested,
}: {
  readonly propertyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRequested: () => void;
}) {
  const id = useId();
  const [period, setPeriod] = useState(defaultPeriod);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const failure = await runAction(() =>
        requestPropertyDocumentAction({ propertyId, kind: 'owner_report', ...period }),
      );
      if (failure !== undefined) {
        setError(failure);
        return;
      }
      toast.success('Estamos armando el reporte al propietario.');
      onOpenChange(false);
      onRequested();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reporte al propietario</DialogTitle>
          <DialogDescription>
            Publicaciones activas, visitas por portal, envíos y consultas del período. Se arma en
            PDF y lo podés descargar o mandar por email.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-from`}>Desde</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={period.from}
              onChange={(event) => {
                setPeriod({ ...period, from: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-to`}>Hasta</Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={period.to}
              onChange={(event) => {
                setPeriod({ ...period, to: event.target.value });
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Armar el reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendOwnerReportDialog({
  propertyId,
  document,
  onClose,
}: {
  readonly propertyId: string;
  readonly document: PropertyDocumentRow;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const failure = await runAction(() =>
        sendOwnerReportAction(propertyId, {
          documentId: document.id,
          to: to.trim(),
          ...(message.trim() === '' ? {} : { message: message.trim() }),
        }),
      );
      if (failure !== undefined) {
        setError(failure);
        return;
      }
      toast.success('Le mandamos el reporte al propietario.');
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar el reporte</DialogTitle>
          <DialogDescription>Va por email, con el PDF adjunto.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-to`}>Email del propietario</Label>
            <Input
              id={`${id}-to`}
              type="email"
              autoComplete="off"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-message`}>Mensaje (opcional)</Label>
            <Textarea
              id={`${id}-message`}
              rows={4}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || to.trim() === ''}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
