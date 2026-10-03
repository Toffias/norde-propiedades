'use client';

import {
  CONTACT_CHANNEL_LABELS,
  OPPORTUNITY_INTENT_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type ClientFeaturedRow,
  type ClientOpportunityRow,
  type ClientSavedSearchRow,
  type SavedSearchDetail,
} from '@norde/core/clients/contracts';
import type { PanelPropertyRow } from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn, DataTableSort } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { Switch } from '@norde/ui/components/switch';
import {
  ArchiveRestoreIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  StarOffIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDate, formatDateTime, formatMoney } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import {
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../../properties/labels';
import { OpportunityStagePill } from '../../opportunities/components/opportunity-stage-pill';
import { operationsSummary } from '../../properties/property-format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { listingPrice, reactionLabel } from '../activity-format';
import { setFeaturedAutoSendAction, unfeaturePropertyAction } from '../activity-actions';
import { deleteSavedSearchAction, restoreSavedSearchAction } from '../saved-search-actions';
import { SavedSearchSheet } from './saved-search-sheet';
import { userName } from '../client-format';

// Las pestañas de la ficha del contacto con listados: oportunidades, destacadas, búsquedas
// guardadas y propiedades de las que es propietario. Todas paginan en el servidor.

/** La ficha de una propiedad: typedRoutes no verifica un string armado. */
function propertyHref(propertyId: string): Route {
  return `/propiedades/${propertyId}` as Route;
}

export function ClientOpportunitiesGrid({
  page,
  sort,
}: {
  readonly page: Page<ClientOpportunityRow>;
  readonly sort: DataTableSort;
}) {
  const columns: readonly DataTableColumn<ClientOpportunityRow>[] = [
    {
      id: 'createdAt',
      header: 'Creada',
      sortable: true,
      className: 'w-40 whitespace-nowrap',
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: 'type',
      header: 'Busca',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{OPPORTUNITY_TYPE_LABELS[row.type] ?? row.type}</span>
          <span className="text-xs text-muted-foreground">
            {OPPORTUNITY_INTENT_LABELS[row.intent] ?? row.intent}
          </span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (row) => <OpportunityStagePill stage={row.stage} status={row.status} />,
    },
    {
      id: 'channel',
      header: 'Origen',
      showFrom: 'md',
      cell: (row) => CONTACT_CHANNEL_LABELS[row.originChannel] ?? row.originChannel,
    },
    {
      id: 'agent',
      header: 'Agente',
      showFrom: 'md',
      cell: (row) => (row.agent === undefined ? 'Sin agente' : userName(row.agent)),
    },
    {
      id: 'property',
      header: 'Propiedad',
      showFrom: 'lg',
      cell: (row) =>
        row.propertyId === undefined ? (
          EMPTY_VALUE
        ) : (
          <Link href={propertyHref(row.propertyId)} className="text-primary hover:underline">
            Ver
          </Link>
        ),
    },
  ];

  return (
    <ServerDataTable
      label="Oportunidades del contacto"
      columns={columns}
      getRowId={(row) => row.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      empty="El contacto no tiene oportunidades. Se crean cuando consulta por un canal."
    />
  );
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

/** El auto-envío de novedades de una destacada: se guarda al cambiarlo. */
function AutoSendSwitch({
  clientId,
  row,
  disabled,
}: {
  readonly clientId: string;
  readonly row: ClientFeaturedRow;
  readonly disabled: boolean;
}) {
  const [checked, setChecked] = useState(row.autoSendUpdates);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={checked}
      disabled={disabled || pending}
      aria-label={`Auto-envío de novedades de ${row.property?.code ?? 'la propiedad'}`}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(async () => {
          const message = await runAction(() =>
            setFeaturedAutoSendAction({ clientId, propertyId: row.propertyId, enabled: next }),
          );
          if (message !== undefined) {
            setChecked(!next);
            toast.error(message);
          }
        });
      }}
    />
  );
}

export function ClientFeaturedGrid({
  clientId,
  page,
  canEdit,
}: {
  readonly clientId: string;
  readonly page: Page<ClientFeaturedRow>;
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | undefined>();
  const columns: readonly DataTableColumn<ClientFeaturedRow>[] = [
    {
      id: 'property',
      header: 'Propiedad',
      className: 'whitespace-normal',
      cell: (row) =>
        row.property === undefined ? (
          <span className="text-muted-foreground">Ya no está en la cartera</span>
        ) : (
          <div className="flex min-w-0 flex-col">
            <Link href={propertyHref(row.propertyId)} className="font-medium hover:underline">
              {row.property.code} · {row.property.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {row.property.address ?? EMPTY_VALUE}
            </span>
          </div>
        ),
    },
    {
      id: 'price',
      header: 'Precio',
      showFrom: 'md',
      cell: (row) =>
        row.property === undefined ? EMPTY_VALUE : listingPrice(row.property.operations),
    },
    {
      id: 'match',
      header: 'Coincidencia',
      cell: (row) =>
        row.matchScore === undefined ? (
          <span
            className="text-muted-foreground"
            title="El contacto no tenía búsquedas guardadas al destacarla."
          >
            Sin búsqueda
          </span>
        ) : (
          <span title="Con su mejor búsqueda guardada, al destacarla.">
            <StatusPill
              tone={row.matchScore === 100 ? 'green' : row.matchScore >= 50 ? 'amber' : 'gray'}
            >
              {row.matchScore.toLocaleString('es-AR')} %
            </StatusPill>
          </span>
        ),
    },
    {
      id: 'reaction',
      header: 'Reacción',
      showFrom: 'md',
      cell: (row) =>
        row.reaction === undefined ? (
          <span className="text-muted-foreground">Sin respuesta</span>
        ) : (
          <StatusPill tone={row.reaction === 'liked' ? 'green' : 'red'}>
            {reactionLabel(row.reaction)}
          </StatusPill>
        ),
    },
    {
      id: 'featuredAt',
      header: 'Destacada',
      sortable: true,
      showFrom: 'lg',
      className: 'whitespace-nowrap',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="tabular-nums">{formatDateTime(row.featuredAt)}</span>
          <span className="text-xs text-muted-foreground">
            {row.featuredBy === undefined ? 'El sistema' : userName(row.featuredBy)}
          </span>
        </div>
      ),
    },
    {
      id: 'autoSend',
      header: 'Novedades',
      showFrom: 'md',
      cell: (row) => (
        <span title="Le manda por email los cambios de la propiedad. Los envíos se activan próximamente.">
          <AutoSendSwitch clientId={clientId} row={row} disabled={!canEdit} />
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-12',
      cell: (row) => (
        <RowActions>
          {row.property !== undefined && (
            <RowAction
              icon={ExternalLinkIcon}
              label="Ver ficha"
              onClick={() => {
                router.push(propertyHref(row.propertyId));
              }}
            />
          )}
          {canEdit && (
            <RowAction
              icon={StarOffIcon}
              label="Quitar destacada"
              onClick={() => {
                setPending({
                  run: () => unfeaturePropertyAction({ clientId, propertyId: row.propertyId }),
                  copy: {
                    title: 'Quitar destacada',
                    description: `${row.property?.code ?? 'La propiedad'} deja de estar destacada para este contacto.`,
                    confirm: 'Quitar',
                    done: 'Destacada quitada',
                  },
                });
              }}
            />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Propiedades destacadas"
        columns={columns}
        getRowId={(row) => row.id}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        empty="No tiene propiedades destacadas. Destacale desde la pestaña Ofrecer."
      />
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
    </>
  );
}

function priceRange(row: ClientSavedSearchRow): string {
  if (row.currency !== 'USD' && row.currency !== 'ARS') return EMPTY_VALUE;
  const { currency } = row;
  const money = (cents: bigint | undefined) =>
    cents === undefined ? undefined : formatMoney({ amountCents: cents, currency });
  const min = money(row.minPriceCents);
  const max = money(row.maxPriceCents);
  if (min !== undefined && max !== undefined) return `${min} a ${max}`;
  if (min !== undefined) return `Desde ${min}`;
  if (max !== undefined) return `Hasta ${max}`;
  return EMPTY_VALUE;
}

// Las búsquedas guardan la operación y los tipos como texto: se muestran con su etiqueta si la hay.
const OPERATION_TEXT: Readonly<Record<string, string>> = OPERATION_LABELS;
const PROPERTY_TYPE_TEXT: Readonly<Record<string, string>> = PROPERTY_TYPE_LABELS;

function searchSummary(row: ClientSavedSearchRow): string {
  const operation = OPERATION_TEXT[row.operation] ?? row.operation;
  const types = row.propertyTypes.map((type) => PROPERTY_TYPE_TEXT[type] ?? type).join(', ');
  return [operation, types].filter((part) => part !== '').join(' · ');
}

/** Vigentes o papelera: va en el toolbar, dentro de la grilla (usa su navegación). */
function SavedSearchViewSelect({ view }: { readonly view: 'active' | 'trash' }) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={view}
      onValueChange={(next) => {
        setParams({ view: next === 'active' ? undefined : next });
      }}
    >
      <SelectTrigger className="w-full sm:w-[160px]" aria-label="Qué ver">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Vigentes</SelectItem>
        <SelectItem value="trash">Papelera</SelectItem>
      </SelectContent>
    </Select>
  );
}

function savedSearchTitle(row: ClientSavedSearchRow): string {
  return row.name ?? searchSummary(row);
}

export function ClientSavedSearchesGrid({
  clientId,
  page,
  sort,
  view,
  canEdit,
  detail,
  activeOpportunityId,
}: {
  readonly clientId: string;
  readonly page: Page<ClientSavedSearchRow>;
  readonly sort: DataTableSort;
  readonly view: 'active' | 'trash';
  readonly canEdit: boolean;
  /** La búsqueda del panel de edición, si está abierto. */
  readonly detail: PanelData<SavedSearchDetail> | undefined;
  readonly activeOpportunityId: string | undefined;
}) {
  // La ficha usa `tab` para su pestaña: el panel no lo toca.
  const navigation = usePanel({ keepTab: true });
  const [pending, setPending] = useState<PendingAction | undefined>();
  const inTrash = view === 'trash';
  const columns: readonly DataTableColumn<ClientSavedSearchRow>[] = [
    {
      id: 'name',
      header: 'Búsqueda',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name ?? searchSummary(row)}</span>
          {row.name !== undefined && (
            <span className="text-xs text-muted-foreground">{searchSummary(row)}</span>
          )}
        </div>
      ),
    },
    { id: 'price', header: 'Precio', showFrom: 'md', cell: priceRange },
    {
      id: 'locations',
      header: 'Ubicaciones',
      showFrom: 'lg',
      cell: (row) =>
        row.locationCount === 0
          ? 'Cualquiera'
          : `${row.locationCount.toLocaleString('es-AR')} ${row.locationCount === 1 ? 'ubicación' : 'ubicaciones'}`,
    },
    {
      id: 'autoSend',
      header: 'Envío automático',
      showFrom: 'md',
      cell: (row) =>
        row.unsubscribed ? (
          <StatusPill tone="gray">Se dio de baja</StatusPill>
        ) : row.autoSend ? (
          <StatusPill tone="green">Activo</StatusPill>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    inTrash
      ? {
          id: 'deletedAt',
          header: 'Borrada',
          className: 'whitespace-nowrap',
          cell: (row) => (
            <span className="tabular-nums">
              {row.deletedAt === undefined ? EMPTY_VALUE : formatDate(row.deletedAt)}
            </span>
          ),
        }
      : {
          id: 'updatedAt',
          header: 'Actualizada',
          sortable: true,
          className: 'whitespace-nowrap',
          cell: (row) => <span className="tabular-nums">{formatDate(row.updatedAt)}</span>,
        },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-12',
      cell: (row) => (
        <RowActions>
          {!inTrash && (
            <RowAction
              icon={PencilIcon}
              label={canEdit ? 'Editar' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
          )}
          {canEdit && !inTrash && (
            <RowAction
              icon={Trash2Icon}
              label="Borrar"
              destructive
              onClick={() => {
                setPending({
                  run: () => deleteSavedSearchAction({ clientId, savedSearchId: row.id }),
                  copy: {
                    title: 'Borrar búsqueda',
                    description: `"${savedSearchTitle(row)}" pasa a la papelera; desde ahí la podés restaurar.`,
                    confirm: 'Borrar',
                    done: 'Búsqueda borrada',
                    destructive: true,
                  },
                });
              }}
            />
          )}
          {canEdit && inTrash && (
            <RowAction
              icon={ArchiveRestoreIcon}
              label="Restaurar"
              onClick={() => {
                setPending({
                  run: () => restoreSavedSearchAction({ clientId, savedSearchId: row.id }),
                  copy: {
                    title: 'Restaurar búsqueda',
                    description: `"${savedSearchTitle(row)}" vuelve a las búsquedas del contacto.`,
                    confirm: 'Restaurar',
                    done: 'Búsqueda restaurada',
                  },
                });
              }}
            />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Búsquedas guardadas"
        columns={columns}
        getRowId={(row) => row.id}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        sort={sort}
        toolbar={
          <>
            <SavedSearchViewSelect view={view} />
            {canEdit && !inTrash && (
              <Button type="button" className="sm:ml-auto" onClick={navigation.openNew}>
                <PlusIcon className="h-4 w-4" />
                Nueva búsqueda
              </Button>
            )}
          </>
        }
        empty={inTrash ? 'La papelera está vacía.' : 'No tiene búsquedas guardadas.'}
      />
      <SavedSearchSheet
        navigation={navigation}
        clientId={clientId}
        detail={detail}
        activeOpportunityId={activeOpportunityId}
        canEdit={canEdit}
      />
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
    </>
  );
}

export function ClientOwnedPropertiesGrid({
  page,
  sort,
}: {
  readonly page: Page<PanelPropertyRow>;
  readonly sort: DataTableSort;
}) {
  const columns: readonly DataTableColumn<PanelPropertyRow>[] = [
    {
      id: 'code',
      header: 'Propiedad',
      sortable: true,
      className: 'whitespace-normal',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link href={propertyHref(row.id)} className="font-medium hover:underline">
            {row.code} · {row.portalTitle}
          </Link>
          <span className="text-xs text-muted-foreground">
            {PROPERTY_TYPE_LABELS[row.propertyType]} ·{' '}
            {[row.neighborhood, row.city].filter((part) => part !== '').join(', ')}
          </span>
        </div>
      ),
    },
    {
      id: 'price',
      header: 'Precio',
      showFrom: 'md',
      cell: (row) => operationsSummary(row.operations),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (row) => (
        <StatusPill tone={PROPERTY_STATUS_DISPLAY[row.status].tone}>
          {PROPERTY_STATUS_DISPLAY[row.status].label}
        </StatusPill>
      ),
    },
    {
      id: 'updatedAt',
      header: 'Actualizada',
      sortable: true,
      showFrom: 'lg',
      className: 'whitespace-nowrap',
      cell: (row) => <span className="tabular-nums">{formatDate(row.updatedAt)}</span>,
    },
  ];

  return (
    <ServerDataTable
      label="Propiedades de las que es propietario"
      columns={columns}
      getRowId={(row) => row.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      empty="No es propietario de ninguna propiedad de la cartera."
    />
  );
}
