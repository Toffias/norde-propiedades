'use client';

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_VALUES,
  INQUIRY_TAB_VALUES,
  type InquiryInboxRow,
  type InquiryTabCounts,
  type InquiryTabValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { DateRangePicker } from '@norde/ui/components/date-range-picker';
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
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { initials } from '@norde/ui/lib/initials';
import { cn } from '@norde/ui/lib/utils';
import {
  ArchiveRestoreIcon,
  HomeIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  Trash2Icon,
  UserCheckIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useId, useState } from 'react';

import { MoreFiltersButton } from '../../shared/components/more-filters-button';
import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import { listingPrice } from '../../clients/activity-format';
import { formatPhone, userName, whatsappHref } from '../../clients/client-format';
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

import { AssignInquiryDialog } from './assign-inquiry-dialog';

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
  /** Asignar, borrar y restaurar ("Administrar consultas"). */
  readonly manage: boolean;
  /** Elegir el agente al asignar (`users:read`). */
  readonly pickAgents: boolean;
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

/** El color de cada pestaña: el punto, y el borde y el tinte de la tarjeta elegida. */
const TAB_TONES: Readonly<Record<InquiryTabValue, { dot: string; active: string }>> = {
  pending: {
    dot: 'bg-warning-500',
    active: 'border-warning-500 bg-warning-50 dark:bg-warning-700/20',
  },
  assigned: {
    dot: 'bg-success-500',
    active: 'border-success-500 bg-success-50 dark:bg-success-700/20',
  },
  deleted: {
    dot: 'bg-muted-foreground',
    active: 'border-muted-foreground bg-muted',
  },
};

/** Una tarjeta por pestaña con su total (con los filtros aplicados): tocarla cambia de pestaña. */
function TabCardsBody({
  tab,
  counts,
}: {
  readonly tab: InquiryTabValue;
  readonly counts: InquiryTabCounts;
}) {
  const { setParams } = useListNavigation();
  return (
    <nav aria-label="Estado de las consultas">
      <ul className="grid grid-cols-3 gap-2">
        {INQUIRY_TAB_VALUES.map((value) => {
          const active = tab === value;
          const count = counts[value];
          return (
            <li key={value}>
              <button
                type="button"
                aria-pressed={active}
                className={cn(
                  'flex h-full w-full flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-xs transition-colors outline-none hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active && TAB_TONES[value].active,
                  count === 0 && !active && 'text-muted-foreground',
                )}
                onClick={() => {
                  // Pendientes es la pestaña por defecto: sin el param en la URL.
                  if (!active) setParams({ tab: value === 'pending' ? undefined : value });
                }}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TAB_TONES[value].dot)}
                  />
                  <span className="truncate">{INQUIRY_TAB_LABELS[value]}</span>
                </span>
                <span className="text-2xl leading-none font-semibold tabular-nums">
                  {count.toLocaleString('es-AR')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Pendientes, Asignadas y Borradas como tarjetas sueltas arriba de la bandeja: su total con los
 * filtros aplicados, y a la vez la pestaña que se está viendo (`?tab=`).
 */
export function InquiryTabCards(props: {
  readonly tab: InquiryTabValue;
  readonly counts: InquiryTabCounts;
}) {
  return (
    <ListNavigationProvider>
      <TabCardsBody {...props} />
    </ListNavigationProvider>
  );
}

/** Sucursal de la consulta: va en línea en pantallas anchas y en "Más filtros" en las angostas. */
function BranchFilter({
  id,
  value,
  label,
}: {
  readonly id?: string;
  readonly value: string;
  readonly label: string | undefined;
}) {
  const { setParams } = useListNavigation();
  return (
    <EntityPicker
      {...(id === undefined ? {} : { id })}
      value={value === '' ? undefined : value}
      initial={value === '' ? undefined : { value, label: label ?? 'Sucursal elegida' }}
      onChange={(branchId) => {
        setParams({ branchId });
      }}
      loadPage={loadBranchOptions}
      placeholder="Todas las sucursales"
      searchPlaceholder="Buscar sucursal"
      clearLabel="Quitar la sucursal"
    />
  );
}

/** "Recibida" como un solo control de rango, para la barra de pantallas anchas. */
function InlineReceivedRange({ from, to }: { readonly from: string; readonly to: string }) {
  const { setParams } = useListNavigation();
  return (
    <DateRangePicker
      label="Recibida"
      placeholder="Recibida: cualquier fecha"
      value={{ from, to }}
      onChange={(range) => {
        setParams({ receivedFrom: range.from, receivedTo: range.to });
      }}
      align="end"
      className="w-[240px]"
    />
  );
}

/**
 * Filtros de la bandeja. En pantallas anchas van todos en línea y ocupan el ancho; en las angostas,
 * sucursal y fechas quedan en "Más filtros" para no apilar cinco controles.
 */
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
  const active = more + [filters.channel, filters.propertyId].filter((v) => v !== '').length;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
      <Select
        value={filters.channel === '' ? ANY : filters.channel}
        onValueChange={(value) => {
          setParams({ channel: value === ANY ? undefined : value });
        }}
      >
        <SelectTrigger aria-label="Canal" className="w-full sm:w-auto sm:min-w-[160px] sm:flex-1">
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
        <div className="w-full sm:w-auto sm:min-w-[200px] sm:flex-[1.5]">
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
      {permissions.pickBranches && (
        <div className="hidden min-w-0 flex-1 lg:block">
          <BranchFilter value={filters.branchId} label={branchLabel} />
        </div>
      )}
      <div className="hidden lg:block">
        <InlineReceivedRange from={filters.receivedFrom} to={filters.receivedTo} />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <MoreFiltersButton active={more} className="lg:hidden" />
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-[min(92vw,340px)] flex-col gap-4">
          {permissions.pickBranches && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-branch`} className="text-xs">
                Sucursal
              </Label>
              <BranchFilter id={`${id}-branch`} value={filters.branchId} label={branchLabel} />
            </div>
          )}
          <DateRange
            label="Recibida"
            from={{ param: 'receivedFrom', value: filters.receivedFrom }}
            to={{ param: 'receivedTo', value: filters.receivedTo }}
          />
        </PopoverContent>
      </Popover>
      {active > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => {
            setParams({
              channel: undefined,
              propertyId: undefined,
              branchId: undefined,
              receivedFrom: undefined,
              receivedTo: undefined,
            });
          }}
        >
          <XIcon className="h-4 w-4" />
          Limpiar
        </Button>
      )}
      {pending && (
        <Loader2Icon
          className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          aria-label="Cargando"
        />
      )}
    </div>
  );
}

/** La foto de la propiedad consultada (link a su ficha), o un hueco que dice por qué no hay. */
function InquiryThumb({ row }: { readonly row: InquiryInboxRow }) {
  const { property } = row;
  const frame =
    'relative flex min-h-20 w-24 shrink-0 self-stretch items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground sm:w-40';
  if (property === undefined) {
    return (
      <div className={frame}>
        <MessageSquareTextIcon className="h-6 w-6" aria-hidden />
        <span className="sr-only">{missingPropertyLabel(row)}</span>
      </div>
    );
  }
  return (
    <Link
      href={`/propiedades/${property.id}` as Route}
      className={cn(frame, 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
      aria-label={`Ver ${property.code}`}
    >
      {property.coverImageUrl === undefined ? (
        <HomeIcon className="h-6 w-6" aria-hidden />
      ) : (
        // Las fotos vienen del storage (o de la importación): sin optimización de Next.
        // eslint-disable-next-line @next/next/no-img-element -- dominio de las fotos variable
        <img
          src={property.coverImageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <span className="absolute bottom-1 left-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground tabular-nums">
        {property.code}
      </span>
    </Link>
  );
}

function missingPropertyLabel(row: InquiryInboxRow): string {
  return row.propertyId === undefined
    ? 'Sin propiedad consultada'
    : 'La propiedad ya no está en la cartera';
}

/** La propiedad consultada: título, precio y, si los hay, captador y sucursal. */
function InquiryProperty({ row }: { readonly row: InquiryInboxRow }) {
  const { property } = row;
  const details = [
    property && listingPrice(property.operations),
    property?.producer && `Captador: ${userName(property.producer)}`,
    row.branch && `Sucursal: ${row.branch.name ?? EMPTY_VALUE}`,
  ].filter((value) => value !== undefined && value !== EMPTY_VALUE);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {property ? (
        <Link
          href={`/propiedades/${property.id}` as Route}
          className="truncate text-sm font-semibold hover:underline"
        >
          {property.title}
        </Link>
      ) : (
        <span className="text-sm font-semibold text-muted-foreground">
          {missingPropertyLabel(row)}
        </span>
      )}
      {details.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{details.join(' · ')}</span>
      )}
    </div>
  );
}

/** Quién escribió: iniciales, nombre, canal, cuándo y cómo contactarlo. */
function InquirySender({ row, now }: { readonly row: InquiryInboxRow; readonly now: Date }) {
  const name = senderName(row);
  const channel = row.tags.find((tag) => tag.kind === 'channel');
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground"
      >
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <h3 className="font-body text-sm font-semibold">{name}</h3>
          <span className="text-xs text-muted-foreground">
            {channel && `${tagLabel(channel)} · `}
            <time dateTime={row.receivedAt.toISOString()} title={formatDateTime(row.receivedAt)}>
              {formatAge(row.receivedAt, now)}
            </time>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {row.senderEmail !== undefined && (
            <a
              href={`mailto:${row.senderEmail}`}
              className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline"
            >
              <MailIcon className="h-3 w-3 shrink-0" aria-label="Email" />
              <span className="truncate">{row.senderEmail}</span>
            </a>
          )}
          {row.senderPhone !== undefined && (
            <>
              <a
                href={`tel:${row.senderPhone}`}
                className="inline-flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"
              >
                <PhoneIcon className="h-3 w-3 shrink-0" aria-label="Celular" />
                {formatPhone(row.senderPhone)}
              </a>
              <a
                href={whatsappHref(row.senderPhone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp a ${name}`}
                title="Escribir por WhatsApp"
                className="inline-flex items-center hover:text-foreground"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Una consulta de la bandeja: la propiedad al frente (foto, título y precio), y debajo quién
 * escribió y qué. Las acciones van a la derecha (abajo, en mobile).
 */
function InquiryCard({
  row,
  now,
  canManage,
  onAction,
  onAssign,
}: {
  readonly row: InquiryInboxRow;
  readonly now: Date;
  readonly canManage: boolean;
  readonly onAction: (action: PendingAction) => void;
  readonly onAssign: (row: InquiryInboxRow) => void;
}) {
  // El canal ya va al lado del nombre.
  const tags = row.tags.filter((tag) => tag.kind !== 'channel');
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <InquiryThumb row={row} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <InquiryProperty row={row} />
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <InquirySender row={row} now={now} />
            {row.message !== undefined && (
              <p className="line-clamp-3 text-sm whitespace-pre-line">“{row.message}”</p>
            )}
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas">
                {tags.map((tag) => (
                  <li key={`${tag.kind}:${tag.value}`}>
                    <SoftBadge>{tagLabel(tag)}</SoftBadge>
                  </li>
                ))}
              </ul>
            )}
            {row.status === 'assigned' && (
              <div className="flex items-center gap-1.5 text-xs">
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
              <div className="text-xs text-muted-foreground">
                Borrada{row.deletedBy === undefined ? '' : ` por ${userName(row.deletedBy)}`} el{' '}
                {formatDateTime(row.deletedAt)}
              </div>
            )}
          </div>
        </div>
      </div>
      {canManage && <InquiryActions row={row} onAction={onAction} onAssign={onAssign} />}
    </li>
  );
}

function InquiryActions({
  row,
  onAction,
  onAssign,
}: {
  readonly row: InquiryInboxRow;
  readonly onAction: (action: PendingAction) => void;
  readonly onAssign: (row: InquiryInboxRow) => void;
}) {
  return (
    <div className="flex gap-2 sm:w-28 sm:flex-col">
      {row.status === 'pending' && (
        <Button
          type="button"
          size="sm"
          className="flex-1 sm:flex-none"
          onClick={() => {
            onAssign(row);
          }}
        >
          <UserCheckIcon className="h-4 w-4" />
          Asignar
        </Button>
      )}
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
  const [assigning, setAssigning] = useState<InquiryInboxRow | undefined>();
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
              onAssign={setAssigning}
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
      {assigning && (
        <AssignInquiryDialog
          key={assigning.id}
          row={assigning}
          pickAgents={permissions.pickAgents}
          onOpenChange={(open) => {
            if (!open) setAssigning(undefined);
          }}
        />
      )}
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
