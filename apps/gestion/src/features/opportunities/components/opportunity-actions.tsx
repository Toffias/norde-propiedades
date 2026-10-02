'use client';

import {
  CLOSE_REASON_RATING_LABELS,
  type ClientUserRef,
  type CloseReasonRow,
  type OpportunityActions,
  type OpportunityStageRow,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  UserCogIcon,
} from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { userName } from '../../clients/client-format';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import {
  changeOpportunityStageAction,
  closeOpportunityAction,
  reassignOpportunityAction,
} from '../pipeline-actions';

import { ColorDot } from './catalog-pieces';

/** Los catálogos de Mi empresa → Oportunidades, completos (tienen tope en el dominio). */
export interface OpportunityCatalogView {
  readonly stages: readonly OpportunityStageRow[];
  readonly closeReasons: readonly CloseReasonRow[];
}

/** La oportunidad sobre la que se actúa. Qué se puede hacer lo decidió el caso de uso. */
export interface OpportunityActionTarget {
  readonly id: string;
  /** Para los textos: "Cerrar la oportunidad de Ana Pérez". */
  readonly clientName: string;
  readonly agent: ClientUserRef | undefined;
  readonly can: OpportunityActions;
}

/**
 * Cerrar con un motivo. Desde el tablero llega el estado en el que se soltó la tarjeta: solo se
 * ofrecen los motivos que cierran en su categoría, y la oportunidad queda en ese estado.
 */
export function CloseDialog({
  target,
  catalog,
  stage,
  open,
  onOpenChange,
}: {
  readonly target: OpportunityActionTarget;
  readonly catalog: OpportunityCatalogView;
  readonly stage?: OpportunityStageRow | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const reasons = catalog.closeReasons.filter(
    (reason) =>
      target.can.closeWith.includes(reason.id) &&
      (stage === undefined || reason.closesAs === stage.category),
  );
  const [reasonId, setReasonId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar la oportunidad</DialogTitle>
          <DialogDescription>
            {stage === undefined
              ? `La oportunidad de ${target.clientName} queda ganada o perdida según el motivo.`
              : `La oportunidad de ${target.clientName} pasa a "${stage.name}".`}{' '}
            Después no se puede volver a abrir.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>Motivo</Label>
          <Select value={reasonId ?? ''} onValueChange={setReasonId}>
            <SelectTrigger id={`${id}-reason`}>
              <SelectValue placeholder="Elegí un motivo" />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((reason) => (
                <SelectItem key={reason.id} value={reason.id}>
                  {reason.name}
                  <span className="text-muted-foreground">
                    {' '}
                    · {CLOSE_REASON_RATING_LABELS[reason.rating]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button
            type="button"
            disabled={pending || reasonId === undefined}
            onClick={() => {
              if (reasonId === undefined) return;
              setError(undefined);
              startTransition(async () => {
                const message = await runAction(() =>
                  closeOpportunityAction({
                    opportunityId: target.id,
                    closeReasonId: reasonId,
                    ...(stage === undefined ? {} : { stageId: stage.id }),
                  }),
                );
                if (message !== undefined) {
                  setError(message);
                  return;
                }
                toast.success('Oportunidad cerrada');
                onOpenChange(false);
              });
            }}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Cerrar oportunidad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  target,
  open,
  onOpenChange,
}: {
  readonly target: OpportunityActionTarget;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [agentId, setAgentId] = useState<string | undefined>(target.agent?.id);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reasignar la oportunidad</DialogTitle>
          <DialogDescription>
            La oportunidad de {target.clientName} pasa al agente que elijas y a su sucursal. El
            agente del contacto no cambia.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <EntityPicker
          value={agentId}
          initial={
            target.agent === undefined
              ? undefined
              : { value: target.agent.id, label: userName(target.agent) }
          }
          onChange={setAgentId}
          loadPage={loadUserOptions}
          placeholder="Sin agente"
          searchPlaceholder="Buscar agente"
          clearLabel="Dejarla sin agente"
        />
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
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const message = await runAction(() =>
                  reassignOpportunityAction({ opportunityId: target.id, agentId: agentId ?? null }),
                );
                if (message !== undefined) {
                  setError(message);
                  return;
                }
                toast.success('Oportunidad reasignada');
                onOpenChange(false);
              });
            }}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Menú de acciones de una oportunidad: pasarla a otro estado, cerrarla con un motivo y
 * reasignarla. Solo ofrece lo que el caso de uso dijo que se puede (`target.can`); si no hay nada,
 * no se muestra.
 */
export function OpportunityActionsMenu({
  target,
  catalog,
  canPickAgents,
  variant = 'icon',
}: {
  readonly target: OpportunityActionTarget;
  readonly catalog: OpportunityCatalogView;
  /** Reasignar pide elegir entre los usuarios (`users:read`). */
  readonly canPickAgents: boolean;
  /** `icon` en una fila; `button` en la ficha del contacto. */
  readonly variant?: 'icon' | 'button';
}) {
  const [dialog, setDialog] = useState<'close' | 'reassign' | undefined>();
  const [pending, startTransition] = useTransition();
  const stages = catalog.stages.filter((stage) => target.can.moveTo.includes(stage.id));
  const canClose = target.can.closeWith.length > 0;
  const canReassign = target.can.reassign && canPickAgents;
  if (stages.length === 0 && !canClose && !canReassign) return null;

  function moveTo(stage: OpportunityStageRow) {
    startTransition(async () => {
      const message = await runAction(() =>
        changeOpportunityStageAction({ opportunityId: target.id, stageId: stage.id }),
      );
      if (message !== undefined) toast.error(message);
      else toast.success(`Pasó a "${stage.name}"`);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'icon' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones de la oportunidad de ${target.clientName}`}
              disabled={pending}
            >
              {pending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontalIcon className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Cambiar estado
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {stages.length > 0 && <DropdownMenuLabel>Pasar a</DropdownMenuLabel>}
          {stages.map((stage) => (
            <DropdownMenuItem
              key={stage.id}
              onSelect={() => {
                moveTo(stage);
              }}
            >
              <ColorDot color={stage.color} className="h-2.5 w-2.5" />
              <span className="truncate">{stage.name}</span>
            </DropdownMenuItem>
          ))}
          {stages.length > 0 && (canClose || canReassign) && <DropdownMenuSeparator />}
          {canClose && (
            <DropdownMenuItem
              onSelect={() => {
                setDialog('close');
              }}
            >
              <CheckCircle2Icon className="h-4 w-4" />
              Cerrar…
            </DropdownMenuItem>
          )}
          {canReassign && (
            <DropdownMenuItem
              onSelect={() => {
                setDialog('reassign');
              }}
            >
              <UserCogIcon className="h-4 w-4" />
              Reasignar…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'close' && (
        <CloseDialog
          target={target}
          catalog={catalog}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        />
      )}
      {dialog === 'reassign' && (
        <ReassignDialog
          target={target}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        />
      )}
    </>
  );
}
