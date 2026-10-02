'use client';

import {
  CreateOpportunityStageInputSchema,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_VALUES,
  type CreateOpportunityStageInput,
  type OpportunityStageRow,
} from '@norde/core/clients/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { ActionResult } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { EntitySheet, useLastDefined, usePanel } from '../../shared/components/entity-sheet';
import {
  createOpportunityStageAction,
  deactivateOpportunityStageAction,
  reactivateOpportunityStageAction,
  reorderOpportunityStagesAction,
  updateOpportunityStageAction,
} from '../actions';

import { ColorDot, isCatalogPanel, SheetForm, SortableCatalog } from './catalog-pieces';

/** Pestaña del panel de alta (`?panel=new&tab=estado`). */
export const STAGE_PANEL_TAB = 'estado';

const DEFAULT_COLOR = '#3b82f6';

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function StageForm({
  stage,
  readOnly,
  onDone,
}: {
  readonly stage: OpportunityStageRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateOpportunityStageInput>({
    resolver: contractResolver(CreateOpportunityStageInputSchema),
    defaultValues: {
      name: stage?.name ?? '',
      color: stage?.color ?? DEFAULT_COLOR,
      category: stage?.category ?? 'new',
    },
  });
  const color = useWatch({ control: form.control, name: 'color' });

  return (
    <SheetForm
      form={form}
      submit={(values) =>
        stage === undefined
          ? createOpportunityStageAction(values)
          : updateOpportunityStageAction({
              stageId: stage.id,
              name: values.name,
              color: values.color,
            })
      }
      done={stage === undefined ? 'Estado creado' : 'Estado actualizado'}
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre</FormLabel>
            <FormControl>
              <Input autoComplete="off" autoFocus readOnly={readOnly} maxLength={40} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="color"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Color</FormLabel>
            <div className="flex items-center gap-3">
              <FormControl>
                <Input
                  type="color"
                  className="h-9 w-14 cursor-pointer p-1"
                  disabled={readOnly}
                  {...field}
                />
              </FormControl>
              <ColorDot color={color} />
              <span className="font-mono text-sm text-muted-foreground">{color}</span>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Categoría</FormLabel>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={readOnly || stage !== undefined}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {OPPORTUNITY_STATUS_VALUES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {OPPORTUNITY_STATUS_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {stage === undefined
                ? 'Las reglas y los reportes usan la categoría. No se puede cambiar después.'
                : 'La categoría no cambia: las oportunidades que tienen este estado la conservan.'}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SheetForm>
  );
}

/**
 * Los estados de oportunidad que edita Norde (ADR 0013): nombre, color y orden. El orden es el de
 * las secciones de la lista y las columnas del tablero.
 */
export function OpportunityStagesSettings({
  stages,
  disabled,
}: {
  readonly stages: readonly OpportunityStageRow[];
  readonly disabled: boolean;
}) {
  const navigation = usePanel();
  const shown = useLastDefined(navigation.panel);
  const creating = shown?.kind === 'new' && shown.tab === STAGE_PANEL_TAB;
  const editing =
    shown?.kind === 'edit' ? stages.find((stage) => stage.id === shown.id) : undefined;
  const open = isCatalogPanel(navigation.panel, STAGE_PANEL_TAB, stages);
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>();

  function toggle(stage: OpportunityStageRow) {
    setPendingAction(
      stage.isActive
        ? {
            copy: {
              title: `¿Desactivar "${stage.name}"?`,
              description:
                'Deja de ofrecerse al cambiar el estado de una oportunidad. Las que ya lo tienen lo conservan.',
              confirm: 'Desactivar',
              done: 'Estado desactivado',
            },
            run: () => deactivateOpportunityStageAction({ stageId: stage.id }),
          }
        : {
            copy: {
              title: `¿Activar "${stage.name}"?`,
              description: 'Vuelve a ofrecerse en la lista y en el tablero.',
              confirm: 'Activar',
              done: 'Estado activado',
            },
            run: () => reactivateOpportunityStageAction({ stageId: stage.id }),
          },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Arrastrá para ordenar. Cada estado pertenece a una categoría fija, que usan las reglas y
          los reportes.
        </p>
        {!disabled && (
          <Button
            type="button"
            className="shrink-0 sm:ml-auto"
            onClick={() => {
              navigation.openNewIn(STAGE_PANEL_TAB);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo estado
          </Button>
        )}
      </div>
      <SortableCatalog
        items={stages}
        label={(stage) => stage.name}
        disabled={disabled}
        reorder={(stageIds) => reorderOpportunityStagesAction({ stageIds })}
      >
        {(stage) => (
          <>
            <ColorDot color={stage.color} />
            <span className={stage.isActive ? 'font-medium' : 'font-medium text-muted-foreground'}>
              {stage.name}
            </span>
            <Badge variant="secondary">{OPPORTUNITY_STATUS_LABELS[stage.category]}</Badge>
            {!stage.isActive && <Badge variant="outline">Inactivo</Badge>}
            <RowActions className="ml-auto">
              <RowAction
                icon={PencilIcon}
                label={disabled ? 'Ver' : 'Editar'}
                onClick={() => {
                  navigation.openEdit(stage.id);
                }}
              />
              {!disabled && (
                <RowAction
                  icon={stage.isActive ? EyeOffIcon : EyeIcon}
                  label={stage.isActive ? 'Desactivar' : 'Activar'}
                  onClick={() => {
                    toggle(stage);
                  }}
                />
              )}
            </RowActions>
          </>
        )}
      </SortableCatalog>
      <EntitySheet
        open={open}
        onClose={navigation.close}
        title={creating ? 'Nuevo estado' : 'Estado de oportunidad'}
        description={creating ? undefined : editing?.name}
      >
        {(creating || editing !== undefined) && (
          <StageForm
            key={editing?.id ?? 'new'}
            stage={editing}
            readOnly={disabled}
            onDone={navigation.close}
          />
        )}
      </EntitySheet>
      <ConfirmActionDialog
        copy={pendingAction?.copy}
        run={pendingAction?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(next) => {
          if (!next) setPendingAction(undefined);
        }}
      />
    </div>
  );
}
