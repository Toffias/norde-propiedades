'use client';

import {
  CLOSE_REASON_RATING_LABELS,
  CLOSE_REASON_RATING_VALUES,
  CreateCloseReasonInputSchema,
  type CloseReasonRatingValue,
  type CloseReasonRow,
  type CreateCloseReasonInput,
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
import { useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';

import type { ActionResult } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { EntitySheet, useLastDefined, usePanel } from '../../shared/components/entity-sheet';
import {
  createCloseReasonAction,
  deactivateCloseReasonAction,
  reactivateCloseReasonAction,
  reorderCloseReasonsAction,
  updateCloseReasonAction,
} from '../actions';

import { isCatalogPanel, SheetForm, SortableCatalog } from './catalog-pieces';

/** Pestaña del panel de alta (`?panel=new&tab=motivo`). */
export const CLOSE_REASON_PANEL_TAB = 'motivo';

const RATING_BADGE: Readonly<
  Record<CloseReasonRatingValue, ComponentProps<typeof Badge>['variant']>
> = {
  positive: 'success',
  negative: 'warning',
  neutral: 'secondary',
};

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function CloseReasonForm({
  reason,
  readOnly,
  onDone,
}: {
  readonly reason: CloseReasonRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateCloseReasonInput>({
    resolver: contractResolver(CreateCloseReasonInputSchema),
    defaultValues: { name: reason?.name ?? '', rating: reason?.rating ?? 'negative' },
  });

  return (
    <SheetForm
      form={form}
      submit={(values) =>
        reason === undefined
          ? createCloseReasonAction(values)
          : updateCloseReasonAction({ reasonId: reason.id, ...values })
      }
      done={reason === undefined ? 'Motivo creado' : 'Motivo actualizado'}
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
              <Input autoComplete="off" autoFocus readOnly={readOnly} maxLength={80} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="rating"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Calificación</FormLabel>
            <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CLOSE_REASON_RATING_VALUES.map((rating) => (
                  <SelectItem key={rating} value={rating}>
                    {CLOSE_REASON_RATING_LABELS[rating]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              Decide cómo termina la oportunidad: positiva queda ganada; negativa o neutral,
              perdida. Las ya cerradas no cambian.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SheetForm>
  );
}

/** Motivos que se eligen al cerrar una oportunidad, con su calificación. */
export function CloseReasonsSettings({
  reasons,
  disabled,
}: {
  readonly reasons: readonly CloseReasonRow[];
  readonly disabled: boolean;
}) {
  const navigation = usePanel();
  const shown = useLastDefined(navigation.panel);
  const creating = shown?.kind === 'new' && shown.tab === CLOSE_REASON_PANEL_TAB;
  const editing =
    shown?.kind === 'edit' ? reasons.find((reason) => reason.id === shown.id) : undefined;
  const open = isCatalogPanel(navigation.panel, CLOSE_REASON_PANEL_TAB, reasons);
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>();

  function toggle(reason: CloseReasonRow) {
    setPendingAction(
      reason.isActive
        ? {
            copy: {
              title: `¿Desactivar "${reason.name}"?`,
              description:
                'Deja de ofrecerse al cerrar. Las oportunidades cerradas con este motivo lo conservan.',
              confirm: 'Desactivar',
              done: 'Motivo desactivado',
            },
            run: () => deactivateCloseReasonAction({ reasonId: reason.id }),
          }
        : {
            copy: {
              title: `¿Activar "${reason.name}"?`,
              description: 'Vuelve a ofrecerse al cerrar una oportunidad.',
              confirm: 'Activar',
              done: 'Motivo activado',
            },
            run: () => reactivateCloseReasonAction({ reasonId: reason.id }),
          },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Se ofrecen en este orden al cerrar una oportunidad.
        </p>
        {!disabled && (
          <Button
            type="button"
            className="shrink-0 sm:ml-auto"
            onClick={() => {
              navigation.openNewIn(CLOSE_REASON_PANEL_TAB);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo motivo
          </Button>
        )}
      </div>
      {reasons.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no hay motivos de cierre.
        </p>
      ) : (
        <SortableCatalog
          items={reasons}
          label={(reason) => reason.name}
          disabled={disabled}
          reorder={(reasonIds) => reorderCloseReasonsAction({ reasonIds })}
        >
          {(reason) => (
            <>
              <span
                className={reason.isActive ? 'font-medium' : 'font-medium text-muted-foreground'}
              >
                {reason.name}
              </span>
              <Badge variant={RATING_BADGE[reason.rating]}>
                {CLOSE_REASON_RATING_LABELS[reason.rating]}
              </Badge>
              {!reason.isActive && <Badge variant="outline">Inactivo</Badge>}
              <RowActions className="ml-auto">
                <RowAction
                  icon={PencilIcon}
                  label={disabled ? 'Ver' : 'Editar'}
                  onClick={() => {
                    navigation.openEdit(reason.id);
                  }}
                />
                {!disabled && (
                  <RowAction
                    icon={reason.isActive ? EyeOffIcon : EyeIcon}
                    label={reason.isActive ? 'Desactivar' : 'Activar'}
                    onClick={() => {
                      toggle(reason);
                    }}
                  />
                )}
              </RowActions>
            </>
          )}
        </SortableCatalog>
      )}
      <EntitySheet
        open={open}
        onClose={navigation.close}
        title={creating ? 'Nuevo motivo de cierre' : 'Motivo de cierre'}
        description={creating ? undefined : editing?.name}
      >
        {(creating || editing !== undefined) && (
          <CloseReasonForm
            key={editing?.id ?? 'new'}
            reason={editing}
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
