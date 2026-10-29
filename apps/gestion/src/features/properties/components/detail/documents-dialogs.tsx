'use client';

import {
  SINGLE_PROPERTY_SHEET_LAYOUT_VALUES,
  type PropertyDocumentKindValue,
  type PropertyDocumentRow,
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
import {
  DownloadIcon,
  FileTextIcon,
  FilesIcon,
  Loader2Icon,
  PresentationIcon,
  ScrollTextIcon,
  SendIcon,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { formatDateOnly, formatDateTime } from '../../../../lib/format';
import { FormAlert } from '../../../shared/components/form-alert';
import {
  loadPropertyDocumentsAction,
  requestPropertyDocumentAction,
  sendOwnerReportAction,
} from '../../detail-actions';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_DISPLAY,
  SHEET_LAYOUT_LABELS,
  SHOWCASE_ORIENTATION_LABELS,
} from '../../detail-labels';
import { SheetPdfDialog } from '../sheet-pdf-dialog';

/** Cada PDF con su ícono y para qué sirve, para elegirlo y reconocerlo en la lista. */
const DOCUMENT_KINDS: Readonly<
  Record<PropertyDocumentKindValue, { readonly icon: LucideIcon; readonly hint: string }>
> = {
  sheet: { icon: FileTextIcon, hint: 'Todos los datos, para mandar a un interesado' },
  showcase: { icon: PresentationIcon, hint: 'Una hoja para la vidriera de la sucursal' },
  owner_report: { icon: ScrollTextIcon, hint: 'La actividad de un período, para el dueño' },
};

/** Cada cuánto se vuelve a preguntar mientras algún PDF se está armando. */
const POLL_MS = 3000;

/** Elige el formato de la ficha en PDF (#175) y la pide; avisa que se está armando. */
export function SheetDocumentDialog({
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
  return (
    <SheetPdfDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ficha en PDF"
      description="Elegí el formato. Tarda unos segundos en armarse y queda en los PDF de la propiedad."
      layouts={SINGLE_PROPERTY_SHEET_LAYOUT_VALUES}
      onSubmit={async ({ layout, includeAgent }) => {
        const message = await runAction(() =>
          requestPropertyDocumentAction({
            propertyId,
            kind: 'sheet',
            layout,
            ...(includeAgent === undefined ? {} : { includeAgent }),
          }),
        );
        if (message === undefined) {
          toast.success('Estamos armando la ficha en PDF.');
          onRequested();
        }
        return message;
      }}
    />
  );
}

/**
 * Los PDF de la ficha: arriba, para armar uno nuevo; abajo, los pedidos con su estado (se actualiza
 * solo mientras alguno se arma).
 */
export function DocumentsDialog({
  propertyId,
  open,
  onOpenChange,
  onSheet,
  onShowcase,
  onOwnerReport,
}: {
  readonly propertyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** La ficha pide un formato: lo elige su propio diálogo. */
  readonly onSheet: () => void;
  /** La vidriera pide sus opciones: las elige su propio diálogo. */
  readonly onShowcase: () => void;
  /** El reporte pide un período: lo elige su propio diálogo. */
  readonly onOwnerReport: () => void;
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle icon={FilesIcon}>PDF de la propiedad</DialogTitle>
            <DialogDescription>
              Armá un PDF nuevo o descargá uno de los últimos. Tarda unos segundos en armarse: la
              lista se actualiza sola.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['sheet', 'showcase', 'owner_report'] as const).map((kind) => {
              const { icon: Icon, hint } = DOCUMENT_KINDS[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    if (kind === 'owner_report') onOwnerReport();
                    else if (kind === 'sheet') onSheet();
                    else onShowcase();
                  }}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold">{DOCUMENT_KIND_LABELS[kind]}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Últimos pedidos
            </h3>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                <FilesIcon className="size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Todavía no se pidió ningún PDF.</p>
              </div>
            ) : (
              <ul className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
                {documents.map((document) => {
                  const status = DOCUMENT_STATUS_DISPLAY[document.status];
                  const Icon = DOCUMENT_KINDS[document.kind].icon;
                  return (
                    <li
                      key={document.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-4.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {DOCUMENT_KIND_LABELS[document.kind]}
                          {document.layout === undefined ? null : (
                            <span className="font-normal text-muted-foreground">
                              · {SHEET_LAYOUT_LABELS[document.layout]}
                            </span>
                          )}
                          {document.orientation === undefined ? null : (
                            <span className="font-normal text-muted-foreground">
                              · {SHOWCASE_ORIENTATION_LABELS[document.orientation]}
                            </span>
                          )}
                          <StatusPill tone={status.tone}>
                            {document.status === 'pending' && (
                              <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
                            )}
                            {status.label}
                          </StatusPill>
                        </p>
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
                          <Button size="sm" asChild>
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
          </div>
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
          <DialogTitle icon={SendIcon}>Enviar el reporte</DialogTitle>
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
