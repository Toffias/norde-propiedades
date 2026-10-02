'use client';

import {
  OPPORTUNITY_BULK_SKIP_REASON_LABELS,
  OPPORTUNITY_BULK_SKIP_REASON_VALUES,
  type OpportunityBulkActionInput,
  type OpportunityBulkResult,
  type OpportunitySelection,
} from '@norde/core/clients/contracts';
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
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import {
  bulkUpdateOpportunitiesAction,
  getOpportunityBulkOperationAction,
} from '../pipeline-actions';

import { ColorDot } from './catalog-pieces';
import type { OpportunityCatalogView } from './opportunity-actions';

type Kind = OpportunityBulkActionInput['kind'];

const KINDS: readonly Kind[] = ['change_stage', 'close', 'reassign'];

const KIND_LABELS: Readonly<Record<Kind, string>> = {
  change_stage: 'Pasar a otro estado',
  close: 'Cerrar con un motivo',
  reassign: 'Reasignar',
};

/** Qué acciones masivas puede ofrecer la pantalla (el caso de uso vuelve a chequear cada una). */
export interface OpportunityBulkPermissions {
  readonly update: boolean;
  /** Reasignar y elegir entre los usuarios. */
  readonly reassign: boolean;
}

/** Cada cuánto se consulta un cambio masivo encolado. */
const POLL_MS = 2000;

function countLabel(count: number): string {
  return `${count.toLocaleString('es-AR')} ${count === 1 ? 'oportunidad' : 'oportunidades'}`;
}

function summary(result: OpportunityBulkResult): string {
  const parts = [
    result.updated === 1 ? '1 cambiada' : `${result.updated.toLocaleString('es-AR')} cambiadas`,
    result.unchanged > 0 ? `${result.unchanged.toLocaleString('es-AR')} ya estaban así` : undefined,
    result.skippedCount > 0
      ? `${result.skippedCount.toLocaleString('es-AR')} no se pudieron cambiar`
      : undefined,
  ];
  return parts.filter((part) => part !== undefined).join(', ');
}

/** Las omitidas del detalle, por motivo. */
function SkippedReasons({ result }: { readonly result: OpportunityBulkResult }) {
  const counts = OPPORTUNITY_BULK_SKIP_REASON_VALUES.map((reason) => ({
    reason,
    count: result.skipped.filter((item) => item.reason === reason).length,
  })).filter((item) => item.count > 0);
  if (counts.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-sm text-muted-foreground">
      {counts.map(({ reason, count }) => (
        <li key={reason}>
          {OPPORTUNITY_BULK_SKIP_REASON_LABELS[reason]}: {count.toLocaleString('es-AR')}
        </li>
      ))}
      {result.skippedCount > result.skipped.length && (
        <li>Y {(result.skippedCount - result.skipped.length).toLocaleString('es-AR')} más.</li>
      )}
    </ul>
  );
}

type Progress =
  | { readonly kind: 'form' }
  | {
      readonly kind: 'running';
      readonly operationId: string;
      readonly result: OpportunityBulkResult;
    }
  | { readonly kind: 'done'; readonly result: OpportunityBulkResult }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Cambio masivo sobre la selección (las marcadas o todas las del filtro): pasar a otro estado,
 * cerrar con un motivo o reasignar. Hasta 100 se hace al confirmar; más, queda como job y el
 * diálogo muestra el avance hasta que termina.
 */
export function OpportunityBulkDialog({
  selection,
  count,
  catalog,
  permissions,
  open,
  onOpenChange,
}: {
  readonly selection: OpportunitySelection;
  /** Cuántas abarca la selección, para los textos. */
  readonly count: number;
  readonly catalog: OpportunityCatalogView;
  readonly permissions: OpportunityBulkPermissions;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const router = useRouter();
  const kinds = KINDS.filter((kind) =>
    kind === 'reassign' ? permissions.reassign : permissions.update,
  );
  const [kind, setKind] = useState<Kind | undefined>(kinds[0]);
  const [stageId, setStageId] = useState<string | undefined>();
  const [reasonId, setReasonId] = useState<string | undefined>();
  const [agentId, setAgentId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [progress, setProgress] = useState<Progress>({ kind: 'form' });
  const [pending, startTransition] = useTransition();

  // Los estados abiertos activos: a ganada o perdida se llega cerrando.
  const stages = catalog.stages.filter(
    (stage) => stage.isActive && stage.category !== 'won' && stage.category !== 'lost',
  );
  const reasons = catalog.closeReasons.filter((reason) => reason.isActive);

  // Un cambio encolado: se consulta hasta que termina, y entonces se refresca la pantalla.
  const runningId = progress.kind === 'running' ? progress.operationId : undefined;
  useEffect(() => {
    if (runningId === undefined) return;
    const timer = setInterval(() => {
      void getOpportunityBulkOperationAction({ operationId: runningId })
        .then((response) => {
          if (!response.ok) {
            setProgress({ kind: 'failed', message: response.message });
            return;
          }
          const operation = response.value;
          if (operation.status === 'done') {
            setProgress({ kind: 'done', result: operation.result });
            toast.success(summary(operation.result));
            router.refresh();
          } else if (operation.status === 'failed') {
            setProgress({
              kind: 'failed',
              message:
                operation.failure === 'requester_unavailable'
                  ? 'No se pudo terminar: tu usuario ya no tiene permiso para este cambio.'
                  : 'No se pudo terminar: el estado, el motivo o el agente ya no es válido.',
            });
          } else {
            setProgress({ kind: 'running', operationId: runningId, result: operation.result });
          }
        })
        .catch(() => {
          // La excepción quedó logueada en el servidor. El job sigue: se avisa y se deja de mirar.
          setProgress({ kind: 'failed', message: UNEXPECTED_ERROR_MESSAGE });
        });
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [runningId, router]);

  function action(): OpportunityBulkActionInput | undefined {
    switch (kind) {
      case 'change_stage':
        return stageId === undefined ? undefined : { kind, stageId };
      case 'close':
        return reasonId === undefined ? undefined : { kind, closeReasonId: reasonId };
      case 'reassign':
        return { kind, agentId: agentId ?? null };
      case undefined:
        return undefined;
    }
  }
  const chosen = action();

  function submit() {
    if (chosen === undefined) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const response = await bulkUpdateOpportunitiesAction({ selection, action: chosen });
        if (!response.ok) {
          setError(response.message);
          return;
        }
        const output = response.value;
        if (output.mode === 'queued') {
          setProgress({
            kind: 'running',
            operationId: output.operationId,
            result: {
              total: output.total,
              processed: 0,
              updated: 0,
              unchanged: 0,
              skippedCount: 0,
              skipped: [],
            },
          });
          return;
        }
        setProgress({ kind: 'done', result: output.result });
        if (output.result.updated === 0) toast.warning(summary(output.result));
        else toast.success(summary(output.result));
      } catch {
        // La excepción quedó logueada en el servidor.
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambio masivo</DialogTitle>
          <DialogDescription>
            {countLabel(count)}. Cada una se cambia si podés y si el estado en que está lo permite;
            las demás se informan.
          </DialogDescription>
        </DialogHeader>

        {progress.kind === 'form' && (
          <>
            <FormAlert message={error} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-kind`}>Acción</Label>
              <Select
                value={kind ?? ''}
                onValueChange={(next) => {
                  setKind(kinds.find((k) => k === next));
                }}
              >
                <SelectTrigger id={`${id}-kind`} className="w-full">
                  <SelectValue placeholder="Elegí una acción" />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {KIND_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind === 'change_stage' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-stage`}>Estado</Label>
                <Select value={stageId ?? ''} onValueChange={setStageId}>
                  <SelectTrigger id={`${id}-stage`} className="w-full">
                    <SelectValue placeholder="Elegí un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <ColorDot color={stage.color} className="h-2.5 w-2.5" />
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === 'close' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-reason`}>Motivo</Label>
                <Select value={reasonId ?? ''} onValueChange={setReasonId}>
                  <SelectTrigger id={`${id}-reason`} className="w-full">
                    <SelectValue placeholder="Elegí un motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map((reason) => (
                      <SelectItem key={reason.id} value={reason.id}>
                        {reason.name}
                        <span className="text-muted-foreground">
                          {' '}
                          · {reason.closesAs === 'won' ? 'ganada' : 'perdida'}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === 'reassign' && (
              <div className="flex flex-col gap-1.5">
                <Label>Agente</Label>
                <EntityPicker
                  value={agentId}
                  initial={undefined}
                  onChange={setAgentId}
                  loadPage={loadUserOptions}
                  placeholder="Sin agente"
                  searchPlaceholder="Buscar agente"
                  clearLabel="Dejarlas sin agente"
                />
              </div>
            )}
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
              <Button type="button" disabled={pending || chosen === undefined} onClick={submit}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Aplicar a {countLabel(count)}
              </Button>
            </DialogFooter>
          </>
        )}

        {progress.kind === 'running' && (
          <div role="status" className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Procesando: {progress.result.processed.toLocaleString('es-AR')} de{' '}
              {progress.result.total.toLocaleString('es-AR')}.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${String(
                    progress.result.total === 0
                      ? 0
                      : Math.round((progress.result.processed / progress.result.total) * 100),
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sigue aunque cierres esta ventana; cada cambio queda en el historial de su
              oportunidad.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cerrar
              </Button>
            </DialogFooter>
          </div>
        )}

        {progress.kind === 'done' && (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-sm">{summary(progress.result)}.</p>
            <SkippedReasons result={progress.result} />
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Listo
              </Button>
            </DialogFooter>
          </div>
        )}

        {progress.kind === 'failed' && (
          <div className="flex flex-col gap-3">
            <FormAlert message={progress.message} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cerrar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
