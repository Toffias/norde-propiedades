'use client';

import {
  CLIENT_ACTIVITY_KIND_LABELS,
  MAX_CLIENT_NOTE_LENGTH,
  OPPORTUNITY_HISTORY_KIND_VALUES,
  type ClientActivityRow,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { Textarea } from '@norde/ui/components/textarea';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { addClientNoteAction } from '../../clients/activity-actions';
import { ActivityEntry } from '../../clients/components/client-activity-timeline';
import { FormAlert } from '../../shared/components/form-alert';
import { loadOpportunityHistoryAction } from '../pipeline-actions';

/** La oportunidad de la tarjeta: para los textos y para atar la nota. */
export interface OpportunityCardTarget {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
}

/** Nota sobre la oportunidad: queda en su historial y en la actividad del contacto. */
export function OpportunityNoteDialog({
  target,
  open,
  onOpenChange,
}: {
  readonly target: OpportunityCardTarget;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const empty = text.trim() === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (empty) return;
            setError(undefined);
            startTransition(async () => {
              const message = await runAction(() =>
                addClientNoteAction({ clientId: target.clientId, opportunityId: target.id, text }),
              );
              if (message !== undefined) {
                setError(message);
                return;
              }
              toast.success('Nota agregada');
              onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Nota de la oportunidad</DialogTitle>
            <DialogDescription>
              Queda en el historial de la oportunidad de {target.clientName} y en la actividad del
              contacto.
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-note`}>Nota</Label>
            <Textarea
              id={`${id}-note`}
              value={text}
              maxLength={MAX_CLIENT_NOTE_LENGTH}
              rows={4}
              autoFocus
              placeholder="Qué hablaste, qué quedó pendiente…"
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {text.length.toLocaleString('es-AR')} /{' '}
              {MAX_CLIENT_NOTE_LENGTH.toLocaleString('es-AR')}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || empty}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar nota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ANY = 'all';
const HISTORY_PAGE_SIZE = 10;

type HistoryKind = (typeof OPPORTUNITY_HISTORY_KIND_VALUES)[number];

/**
 * El historial de la oportunidad en un modal: lo que quedó atado a ella, lo más reciente primero.
 * Cada página la trae el servidor (filtrada por tipo), sin tocar la URL del tablero.
 */
export function OpportunityHistoryDialog({
  target,
  open,
  onOpenChange,
}: {
  readonly target: OpportunityCardTarget;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<HistoryKind | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(HISTORY_PAGE_SIZE);
  const [data, setData] = useState<Page<ClientActivityRow> | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      try {
        const result = await loadOpportunityHistoryAction({
          opportunityId: target.id,
          page,
          pageSize,
          ...(kind === undefined ? {} : { kind }),
        });
        if (result.ok) {
          setData(result.value);
          setError(undefined);
        } else {
          setError(result.message);
        }
      } catch {
        // La excepción quedó logueada en el servidor.
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }, [open, target.id, kind, page, pageSize]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historial de la oportunidad</DialogTitle>
          <DialogDescription>
            Notas, cambios de estado y lo demás que pasó con la oportunidad de {target.clientName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <Select
            value={kind ?? ANY}
            onValueChange={(next) => {
              setKind(OPPORTUNITY_HISTORY_KIND_VALUES.find((value) => value === next));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[260px]" aria-label="Tipo de evento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos los eventos</SelectItem>
              {OPPORTUNITY_HISTORY_KIND_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CLIENT_ACTIVITY_KIND_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending && (
            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>
        <FormAlert message={error} />
        <div
          aria-busy={pending}
          className={cn('-mx-1 min-h-24 overflow-y-auto px-1', pending && 'opacity-60')}
        >
          {data === undefined ? (
            pending && <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {kind === undefined
                ? 'Todavía no hay nada en el historial.'
                : 'No hay eventos de este tipo.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((entry) => (
                <li key={entry.id} className="py-3">
                  <ActivityEntry entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {data !== undefined && data.total > data.pageSize && (
          <TablePagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
