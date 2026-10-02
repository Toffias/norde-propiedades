'use client';

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_VALUES,
  INQUIRY_TAB_VALUES,
  type InquiryInboxRow,
  type InquiryTabValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import {
  ArchiveRestoreIcon,
  BuildingIcon,
  Loader2Icon,
  MailIcon,
  PhoneIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useId, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import { formatPhone, userName } from '../../clients/client-format';
import { DateRange } from '../../clients/components/clients-toolbar';
import { loadBranchOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { loadPropertyOptions } from '../../properties/actions';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { deleteInquiryAction, restoreInquiryAction } from '../actions';
import { formatAge, INQUIRY_TAB_LABELS, tagLabel } from '../inquiry-format';

/** Filtros de la bandeja tal como están en la URL (texto, sin parsear). */
export interface InquiryFilterValues {
  readonly tab: InquiryTabValue;
  readonly branchId: string;
  readonly channel: string;
  readonly propertyId: string;
  readonly receivedFrom: string;
  readonly receivedTo: string;
}

export interface InquiryPermissions {
  /** Borrar y restaurar ("Administrar consultas"). */
  readonly manage: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
  /** Filtrar por propiedad (`properties:read`). */
  readonly pickProperties: boolean;
}

/** "Todos" en un select: sin el param en la URL. */
const ANY = 'any';

const EMPTY_MESSAGES: Readonly<Record<InquiryTabValue, string>> = {
  pending: 'No hay consultas pendientes. Las que lleguen de los portales y de la web aparecen acá.',
  assigned: 'Todavía no hay consultas asignadas.',
  deleted: 'No hay consultas borradas.',
};

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function senderName(row: InquiryInboxRow): string {
  return row.senderName ?? 'Sin nombre';
}

function Tabs({ tab }: { readonly tab: InquiryTabValue }) {
  const { setParams } = useListNavigation();
  return (
    <div role="group" aria-label="Estado de las consultas" className="flex flex-wrap gap-2">
      {INQUIRY_TAB_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={tab === value}
          className={cn(
            'inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
            tab === value && 'border-transparent bg-foreground text-background hover:bg-foreground',
          )}
          onClick={() => {
            // Pendientes es la pestaña por defecto: sin el param en la URL.
            setParams({ tab: value === 'pending' ? undefined : value });
          }}
        >
          {INQUIRY_TAB_LABELS[value]}
        </button>
      ))}
    </div>
  );
}

function Toolbar({
  filters,
  permissions,
  propertyLabel,
  branchLabel,
}: {
  readonly filters: InquiryFilterValues;
  readonly permissions: InquiryPermissions;
  readonly propertyLabel: string | undefined;
  readonly branchLabel: string | undefined;
}) {
  const id = useId();
  const { setParams, pending } = useListNavigation();
  const more = [filters.branchId, filters.receivedFrom, filters.receivedTo].filter(
    (value) => value !== '',
  ).length;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tab={filters.tab} />
        {pending && (
          <Loader2Icon
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-label="Cargando"
          />
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={filters.channel === '' ? ANY : filters.channel}
          onValueChange={(value) => {
            setParams({ channel: value === ANY ? undefined : value });
          }}
        >
          <SelectTrigger aria-label="Canal" className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los canales</SelectItem>
            {CONTACT_CHANNEL_VALUES.map((channel) => (
              <SelectItem key={channel} value={channel}>
                {CONTACT_CHANNEL_LABELS[channel]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {permissions.pickProperties && (
          <div className="w-full sm:w-[300px]">
            <EntityPicker
              value={filters.propertyId === '' ? undefined : filters.propertyId}
              initial={
                filters.propertyId === ''
                  ? undefined
                  : { value: filters.propertyId, label: propertyLabel ?? 'Propiedad elegida' }
              }
              onChange={(propertyId) => {
                setParams({ propertyId });
              }}
              loadPage={loadPropertyOptions}
              placeholder="Todas las propiedades"
              searchPlaceholder="Código, título o dirección"
              clearLabel="Quitar la propiedad"
            />
          </div>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              <SlidersHorizontalIcon className="h-4 w-4" />
              Más filtros{more > 0 ? ` (${String(more)})` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-[min(92vw,340px)] flex-col gap-4">
            {permissions.pickBranches && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-branch`} className="text-xs">
                  Sucursal
                </Label>
                <EntityPicker
                  id={`${id}-branch`}
                  value={filters.branchId === '' ? undefined : filters.branchId}
                  initial={
                    filters.branchId === ''
                      ? undefined
                      : { value: filters.branchId, label: branchLabel ?? 'Sucursal elegida' }
                  }
                  onChange={(branchId) => {
                    setParams({ branchId });
                  }}
                  loadPage={loadBranchOptions}
                  placeholder="Todas las sucursales"
                  searchPlaceholder="Buscar sucursal"
                  clearLabel="Quitar la sucursal"
                />
              </div>
            )}
            <DateRange
              label="Recibida"
              from={{ param: 'receivedFrom', value: filters.receivedFrom }}
              to={{ param: 'receivedTo', value: filters.receivedTo }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function InquiryCard({
  row,
  now,
  canManage,
  onAction,
}: {
  readonly row: InquiryInboxRow;
  readonly now: Date;
  readonly canManage: boolean;
  readonly onAction: (action: PendingAction) => void;
}) {
  const { property } = row;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{senderName(row)}</h3>
          <time
            dateTime={row.receivedAt.toISOString()}
            title={formatDateTime(row.receivedAt)}
            className="text-xs text-muted-foreground"
          >
            {formatAge(row.receivedAt, now)}
          </time>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MailIcon className="h-3.5 w-3.5 shrink-0" aria-label="Email" />
            {row.senderEmail === undefined ? (
              EMPTY_VALUE
            ) : (
              <a href={`mailto:${row.senderEmail}`} className="truncate hover:underline">
                {row.senderEmail}
              </a>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <PhoneIcon className="h-3.5 w-3.5 shrink-0" aria-label="Celular" />
            {row.senderPhone === undefined ? (
              EMPTY_VALUE
            ) : (
              <a href={`tel:${row.senderPhone}`} className="hover:underline">
                {formatPhone(row.senderPhone)}
              </a>
            )}
          </span>
        </div>
        {row.message !== undefined && (
          <p className="line-clamp-4 text-sm whitespace-pre-line">{row.message}</p>
        )}
        {row.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas">
            {row.tags.map((tag) => (
              <li key={`${tag.kind}:${tag.value}`}>
                <SoftBadge>{tagLabel(tag)}</SoftBadge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 text-xs sm:w-[280px] sm:shrink-0 sm:text-sm">
        <div className="flex items-start gap-1.5">
          <BuildingIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {property ? (
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/propiedades/${property.id}` as Route}
                className="truncate font-medium hover:underline"
              >
                {property.code} · {property.title}
              </Link>
              <span className="text-muted-foreground">Captador: {userName(property.producer)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {row.propertyId === undefined
                ? 'Sin propiedad consultada'
                : 'La propiedad ya no está en la cartera'}
            </span>
          )}
        </div>
        <div className="text-muted-foreground">Sucursal: {row.branch?.name ?? EMPTY_VALUE}</div>
        {row.status === 'assigned' && (
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {row.clientId === undefined ? (
              <span>Asignada a {userName(row.assignedAgent)}</span>
            ) : (
              <Link href={`/contactos/${row.clientId}` as Route} className="hover:underline">
                Asignada a {userName(row.assignedAgent)}
              </Link>
            )}
          </div>
        )}
        {row.deletedAt !== undefined && (
          <div className="text-muted-foreground">
            Borrada{row.deletedBy === undefined ? '' : ` por ${userName(row.deletedBy)}`} el{' '}
            {formatDateTime(row.deletedAt)}
          </div>
        )}
        {canManage && (
          <div className="pt-1">
            {row.deletedAt === undefined ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onAction({
                    copy: {
                      title: 'Borrar consulta',
                      description: `La consulta de ${senderName(row)} pasa a Borradas; desde ahí la podés restaurar.`,
                      confirm: 'Borrar',
                      done: 'Consulta borrada',
                      destructive: true,
                    },
                    run: () => deleteInquiryAction({ inquiryId: row.id }),
                  });
                }}
              >
                <Trash2Icon className="h-4 w-4" />
                Borrar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onAction({
                    copy: {
                      title: 'Restaurar consulta',
                      description: `La consulta de ${senderName(row)} vuelve a la bandeja.`,
                      confirm: 'Restaurar',
                      done: 'Consulta restaurada',
                    },
                    run: () => restoreInquiryAction({ inquiryId: row.id }),
                  });
                }}
              >
                <ArchiveRestoreIcon className="h-4 w-4" />
                Restaurar
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function InboxBody({
  rows,
  total,
  page,
  pageSize,
  now,
  filters,
  permissions,
  propertyLabel,
  branchLabel,
}: InquiriesViewProps & { readonly now: Date }) {
  const { setParams, pending } = useListNavigation();
  const [action, setAction] = useState<PendingAction | undefined>();
  const filtered = [
    filters.branchId,
    filters.channel,
    filters.propertyId,
    filters.receivedFrom,
    filters.receivedTo,
  ].some((value) => value !== '');

  return (
    <div className="flex flex-col">
      <Toolbar
        filters={filters}
        permissions={permissions}
        propertyLabel={propertyLabel}
        branchLabel={branchLabel}
      />
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {filtered
            ? 'No hay consultas que coincidan con los filtros.'
            : EMPTY_MESSAGES[filters.tab]}
        </p>
      ) : (
        <ul
          aria-label={`Consultas ${INQUIRY_TAB_LABELS[filters.tab].toLowerCase()}`}
          className={cn('divide-y divide-border', pending && 'opacity-60')}
        >
          {rows.map((row) => (
            <InquiryCard
              key={row.id}
              row={row}
              now={now}
              canManage={permissions.manage}
              onAction={setAction}
            />
          ))}
        </ul>
      )}
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => {
          setParams({ page: next });
        }}
        onPageSizeChange={(next) => {
          setParams({ pageSize: next });
        }}
      />
      <ConfirmActionDialog
        copy={action?.copy}
        run={action?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setAction(undefined);
        }}
      />
    </div>
  );
}

export interface InquiriesViewProps {
  readonly rows: readonly InquiryInboxRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Instante del render en el servidor (ISO), para la antigüedad de cada consulta. */
  readonly renderedAt: string;
  readonly filters: InquiryFilterValues;
  readonly permissions: InquiryPermissions;
  /** El nombre de la propiedad filtrada, para el selector. */
  readonly propertyLabel: string | undefined;
  readonly branchLabel: string | undefined;
}

/** La bandeja de consultas: pestañas, filtros y tarjetas paginadas en el servidor. */
export function InquiriesView(props: InquiriesViewProps) {
  return (
    <ListNavigationProvider>
      <InboxBody {...props} now={new Date(props.renderedAt)} />
    </ListNavigationProvider>
  );
}
