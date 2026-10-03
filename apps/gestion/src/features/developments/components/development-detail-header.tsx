'use client';

import {
  DEVELOPMENT_STATUS_VALUES,
  type DevelopmentDetail,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ArchiveRestoreIcon, ChevronDownIcon, LandmarkIcon, Trash2Icon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import {
  changeDevelopmentStatusAction,
  deleteDevelopmentAction,
  restoreDevelopmentAction,
} from '../actions';
import {
  CONSTRUCTION_STATUS_LABELS,
  DEVELOPMENT_STATUS_DISPLAY,
  DEVELOPMENT_TYPE_LABELS,
} from '../labels';
import { DevelopmentFavoriteToggle } from './development-favorite-toggle';

export interface DevelopmentDetailPermissions {
  /** Editar la ficha: el caso de uso vuelve a decidirlo (propios, de su sucursal o todos). */
  readonly edit: boolean;
  readonly delete: boolean;
  /** Sumar unidades: crear propiedades y editar el emprendimiento. */
  readonly addUnits: boolean;
  readonly history: boolean;
}

/** Cabecera de la ficha: estado (con su cambio), tipo, código, ubicación y papelera. */
export function DevelopmentDetailHeader({
  detail,
  permissions,
  favorite,
}: {
  readonly detail: DevelopmentDetail;
  readonly permissions: DevelopmentDetailPermissions;
  readonly favorite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<
    { readonly copy: ConfirmActionCopy; readonly run: () => Promise<ActionResult> } | undefined
  >();
  const status = DEVELOPMENT_STATUS_DISPLAY[detail.status];
  const inTrash = detail.deletedAt !== undefined;
  const place = detail.locationPath
    .map((level) => level.name)
    .slice(1)
    .join(' › ');
  const subtitle = [
    detail.developmentType === undefined
      ? undefined
      : DEVELOPMENT_TYPE_LABELS[detail.developmentType],
    detail.code,
    place === '' ? undefined : place,
  ].filter((part) => part !== undefined);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to p-4 text-white sm:flex-row sm:items-center sm:p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary-500">
          <LandmarkIcon className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {detail.constructionStatus !== undefined && (
              <StatusPill tone="amber">
                {CONSTRUCTION_STATUS_LABELS[detail.constructionStatus]}
              </StatusPill>
            )}
            {inTrash && <StatusPill tone="red">En la papelera</StatusPill>}
          </div>
          <h1 className="mt-1 text-lg font-extrabold break-words !text-white" title={detail.name}>
            {detail.name}
          </h1>
          <p className="mt-0.5 text-sm leading-normal text-entity-header-muted">
            {subtitle.join(' · ')}
          </p>
          <p className="text-sm leading-normal text-entity-header-muted">
            {detail.publishAddress} ({detail.privateAddress})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-white/10 p-1">
            <DevelopmentFavoriteToggle developmentId={detail.id} favorite={favorite} />
          </div>
          {permissions.edit && !inTrash && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-foreground dark:bg-card"
                  disabled={pending}
                >
                  Cambiar estado
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DEVELOPMENT_STATUS_VALUES.filter((value) => value !== detail.status).map(
                  (value) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => {
                        startTransition(async () => {
                          const error = await runAction(() =>
                            changeDevelopmentStatusAction({
                              developmentId: detail.id,
                              status: value,
                            }),
                          );
                          if (error === undefined) {
                            toast.success(
                              `Ahora está ${DEVELOPMENT_STATUS_DISPLAY[value].label.toLowerCase()}.`,
                            );
                          } else {
                            toast.error(error);
                          }
                        });
                      }}
                    >
                      {DEVELOPMENT_STATUS_DISPLAY[value].label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {permissions.delete &&
            (inTrash ? (
              <Button
                size="sm"
                variant="outline"
                className="text-foreground dark:bg-card"
                onClick={() => {
                  setConfirm({
                    copy: {
                      title: 'Restaurar emprendimiento',
                      description: `${detail.name} vuelve al listado.`,
                      confirm: 'Restaurar',
                      done: 'Emprendimiento restaurado',
                    },
                    run: () => restoreDevelopmentAction({ developmentId: detail.id }),
                  });
                }}
              >
                <ArchiveRestoreIcon className="h-4 w-4" />
                Restaurar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-foreground dark:bg-card"
                aria-label="Borrar emprendimiento"
                onClick={() => {
                  setConfirm({
                    copy: {
                      title: 'Borrar emprendimiento',
                      description: `${detail.name} va a la papelera; desde ahí lo podés restaurar. Si tiene unidades activas, primero hay que borrarlas.`,
                      confirm: 'Borrar',
                      done: 'Emprendimiento enviado a la papelera',
                      destructive: true,
                    },
                    run: () => deleteDevelopmentAction({ developmentId: detail.id }),
                  });
                }}
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            ))}
        </div>
      </div>
      <ConfirmActionDialog
        copy={confirm?.copy}
        run={confirm?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      />
    </>
  );
}
