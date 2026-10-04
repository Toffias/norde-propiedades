'use client';

import type { AppraisalDetail } from '@norde/core/appraisals/contracts';
import { Button } from '@norde/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import {
  ArchiveRestoreIcon,
  CalculatorIcon,
  ChevronDownIcon,
  FileDownIcon,
  HousePlusIcon,
  Loader2Icon,
  Trash2Icon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { formatDate, formatDateTime } from '../../../lib/format';
import { PROPERTY_TYPE_LABELS } from '../../properties/labels';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import {
  changeAppraisalStatusAction,
  convertAppraisalToListingAction,
  deleteAppraisalAction,
  restoreAppraisalAction,
} from '../actions';
import {
  APPRAISAL_SOURCE_LABELS,
  APPRAISAL_STATUS_ACTION_LABELS,
  APPRAISAL_STATUS_DISPLAY,
} from '../labels';
import { appraisalReportHref } from '../paths';

export interface AppraisalDetailPermissions {
  /** Editar y cambiar el estado: el caso de uso vuelve a decidirlo. */
  readonly edit: boolean;
  /** Convertir en propiedad: además pide poder dar de alta propiedades. */
  readonly convert: boolean;
  readonly delete: boolean;
  readonly history: boolean;
}

/** Cada cuánto se vuelve a pedir la ficha mientras se crea la propiedad de la conversión. */
const REFRESH_MS = 3000;

/** La propiedad en la que se convirtió; la crea un job, así que al principio no tiene código. */
function ConvertedProperty({
  property,
}: {
  readonly property: NonNullable<AppraisalDetail['convertedProperty']>;
}) {
  const router = useRouter();
  const creating = property.code === undefined;

  useEffect(() => {
    if (!creating) return undefined;
    const timer = setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [creating, router]);

  if (creating) {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-entity-header-muted">
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
        Creando la propiedad…
      </p>
    );
  }
  return (
    <p className="mt-1 text-sm text-entity-header-muted">
      Ingresó como{' '}
      <Link
        // La ficha de la propiedad: typedRoutes no verifica un segmento armado.
        href={`/propiedades/${property.id}` as Route}
        className="font-semibold text-white underline underline-offset-2"
      >
        {property.code}
      </Link>
    </p>
  );
}

/** Cabecera de la ficha: código, estado (con su cambio), solicitante, visita y papelera. */
export function AppraisalHeader({
  detail,
  permissions,
}: {
  readonly detail: AppraisalDetail;
  readonly permissions: AppraisalDetailPermissions;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<
    { readonly copy: ConfirmActionCopy; readonly run: () => Promise<ActionResult> } | undefined
  >();
  const status = APPRAISAL_STATUS_DISPLAY[detail.status];
  const inTrash = detail.deletedAt !== undefined;
  const subtitle = [
    PROPERTY_TYPE_LABELS[detail.propertyType],
    detail.address,
    detail.branch?.name,
  ].filter((part) => part !== undefined);
  const facts = [
    `Pedida por ${detail.requester.name ?? 'un contacto sin datos'}`,
    `cargada el ${formatDate(detail.createdAt)}`,
    detail.source === 'manual' ? undefined : APPRAISAL_SOURCE_LABELS[detail.source].toLowerCase(),
    detail.visitAt === undefined ? undefined : `visita: ${formatDateTime(detail.visitAt)}`,
  ].filter((part) => part !== undefined);

  function changeStatus(value: AppraisalDetail['nextStatuses'][number]) {
    startTransition(async () => {
      const error = await runAction(() =>
        changeAppraisalStatusAction({ appraisalId: detail.id, status: value }),
      );
      if (error === undefined) {
        toast.success(`Ahora está ${APPRAISAL_STATUS_DISPLAY[value].label.toLowerCase()}.`);
      } else {
        toast.error(error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to p-4 text-white sm:flex-row sm:items-center sm:p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary-500">
          <CalculatorIcon className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {inTrash && <StatusPill tone="red">En la papelera</StatusPill>}
          </div>
          <h1 className="mt-1 text-lg font-extrabold break-words !text-white">
            Tasación {detail.code}
          </h1>
          <p className="mt-0.5 text-sm leading-normal text-entity-header-muted">
            {subtitle.join(' · ')}
          </p>
          <p className="text-sm leading-normal text-entity-header-muted">{facts.join(' · ')}</p>
          {detail.convertedProperty !== undefined && (
            <ConvertedProperty property={detail.convertedProperty} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.edit && !inTrash && detail.nextStatuses.length > 0 && (
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
                {detail.nextStatuses.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => {
                      changeStatus(value);
                    }}
                  >
                    {APPRAISAL_STATUS_ACTION_LABELS[value]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {detail.reportable && (
            <Button size="sm" variant="outline" className="text-foreground dark:bg-card" asChild>
              {/* Lo sirve una ruta (no una página): se baja con un enlace común. */}
              <a href={appraisalReportHref(detail.id)} download>
                <FileDownIcon className="h-4 w-4" />
                Descargar PDF
              </a>
            </Button>
          )}
          {permissions.convert && !inTrash && detail.convertible && (
            <Button
              size="sm"
              variant="outline"
              className="text-foreground dark:bg-card"
              onClick={() => {
                setConfirm({
                  copy: {
                    title: 'Convertir en propiedad',
                    description: `Se crea una propiedad en borrador con los datos de ${detail.code}, el solicitante como propietario, el valor sugerido máximo como precio y las fotos. La tasación queda ingresada y ya no se edita.`,
                    confirm: 'Convertir',
                    done: 'Tasación convertida: la propiedad se está creando',
                  },
                  run: () => convertAppraisalToListingAction({ appraisalId: detail.id }),
                });
              }}
            >
              <HousePlusIcon className="h-4 w-4" />
              Convertir en propiedad
            </Button>
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
                      title: 'Restaurar tasación',
                      description: `${detail.code} vuelve al listado.`,
                      confirm: 'Restaurar',
                      done: 'Tasación restaurada',
                    },
                    run: () => restoreAppraisalAction({ appraisalId: detail.id }),
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
                aria-label="Borrar tasación"
                onClick={() => {
                  setConfirm({
                    copy: {
                      title: 'Borrar tasación',
                      description: `${detail.code} va a la papelera; desde ahí la podés restaurar.`,
                      confirm: 'Borrar',
                      done: 'Tasación enviada a la papelera',
                      destructive: true,
                    },
                    run: () => deleteAppraisalAction({ appraisalId: detail.id }),
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
