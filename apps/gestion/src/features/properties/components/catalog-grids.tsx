'use client';

import {
  FEATURE_KIND_VALUES,
  LOCATION_KIND_VALUES,
  NO_TAG_GROUP,
  type FeatureKindValue,
  type FeatureRow,
  type LocationKindValue,
  type LocationRow,
  type TagGroupRow,
  type TagRow,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { ListPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE } from '../../../lib/format';
import { NameSearchToolbar } from '../../identity/components/list-toolbar';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { deleteTagAction, deleteTagGroupAction } from '../catalog-actions';
import { FEATURE_KIND_LABELS, LOCATION_KIND_LABELS } from '../labels';
import { FeatureSheet, LocationSheet, TagGroupSheet, TagSheet } from './catalog-sheets';

interface Paged<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(row: { readonly id: string }): string {
  return row.id;
}

/** Botón de alta a la derecha del toolbar. */
function CreateButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <Button type="button" className="sm:ml-auto" onClick={onClick}>
      <PlusIcon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function ParamSelect<T extends string>({
  param,
  value,
  label,
  anyLabel,
  options,
}: {
  readonly param: string;
  readonly value: T | undefined;
  readonly label: string;
  readonly anyLabel?: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={value ?? 'any'}
      onValueChange={(next) => {
        setParams({ [param]: next === 'any' ? undefined : next });
      }}
    >
      <SelectTrigger className="w-full sm:w-[190px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anyLabel !== undefined && <SelectItem value="any">{anyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Ubicaciones ----------

export function LocationsGrid({
  data,
  text,
  kind,
  canEdit,
}: {
  readonly data: Paged<LocationRow>;
  readonly text: string;
  readonly kind: LocationKindValue | undefined;
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const [parent, setParent] = useState<LocationRow | undefined>();

  const columns = useMemo(
    (): readonly DataTableColumn<LocationRow>[] => [
      {
        id: 'name',
        header: 'Nombre',
        sortable: true,
        className: 'font-medium',
        cell: (row) => row.name,
      },
      {
        id: 'kind',
        header: 'Nivel',
        className: 'w-[140px]',
        cell: (row) => <Badge variant="secondary">{LOCATION_KIND_LABELS[row.kind]}</Badge>,
      },
      {
        id: 'ancestors',
        header: 'Dentro de',
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (row) =>
          row.ancestors.length === 0 ? EMPTY_VALUE : [...row.ancestors].reverse().join(', '),
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) => (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label={canEdit ? 'Renombrar' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
            {canEdit && row.kind !== 'subneighborhood' && (
              <RowAction
                icon={ListPlusIcon}
                label="Agregar adentro"
                onClick={() => {
                  setParent(row);
                  navigation.openNew();
                }}
              />
            )}
          </RowActions>
        ),
      },
    ],
    [canEdit, navigation],
  );

  return (
    <>
      <ServerDataTable
        label="Ubicaciones"
        columns={columns}
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sort={data.sort}
        getRowId={getRowId}
        toolbar={
          <>
            <NameSearchToolbar
              text={text}
              view="active"
              canSeeTrash={false}
              activeLabel="Ubicaciones"
            />
            <ParamSelect
              param="kind"
              value={kind}
              label="Nivel"
              anyLabel="Todos los niveles"
              options={LOCATION_KIND_VALUES.map((value) => ({
                value,
                label: LOCATION_KIND_LABELS[value],
              }))}
            />
            {canEdit && (
              <CreateButton
                label="Nueva ubicación"
                onClick={() => {
                  setParent(undefined);
                  navigation.openNew();
                }}
              />
            )}
          </>
        }
        empty={text === '' ? 'Todavía no hay ubicaciones.' : 'No hay ubicaciones con ese nombre.'}
      />
      <LocationSheet navigation={navigation} rows={data.rows} parent={parent} readOnly={!canEdit} />
    </>
  );
}

// ---------- Servicios, ambientes y adicionales ----------

export function FeaturesGrid({
  data,
  text,
  kind,
  state,
  canEdit,
}: {
  readonly data: Paged<FeatureRow>;
  readonly text: string;
  readonly kind: FeatureKindValue;
  readonly state: 'all' | 'active' | 'inactive';
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const columns = useMemo(
    (): readonly DataTableColumn<FeatureRow>[] => [
      {
        id: 'position',
        header: 'Orden',
        sortable: true,
        className: 'w-[90px] tabular-nums',
        cell: (row) => row.position + 1,
      },
      {
        id: 'name',
        header: 'Nombre',
        sortable: true,
        className: 'font-medium',
        cell: (row) => row.name,
      },
      {
        id: 'isActive',
        header: 'Estado',
        className: 'w-[120px]',
        cell: (row) =>
          row.isActive ? (
            <Badge variant="secondary">Activo</Badge>
          ) : (
            <Badge variant="outline">Inactivo</Badge>
          ),
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) => (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label={canEdit ? 'Editar' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
          </RowActions>
        ),
      },
    ],
    [canEdit, navigation],
  );

  return (
    <>
      <ServerDataTable
        label={FEATURE_KIND_LABELS[kind]}
        columns={columns}
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sort={data.sort}
        getRowId={getRowId}
        toolbar={
          <>
            <ParamSelect
              param="kind"
              value={kind}
              label="Catálogo"
              options={FEATURE_KIND_VALUES.map((value) => ({
                value,
                label: FEATURE_KIND_LABELS[value],
              }))}
            />
            <NameSearchToolbar text={text} view="active" canSeeTrash={false} activeLabel="Ítems" />
            <ParamSelect
              param="state"
              value={state === 'all' ? undefined : state}
              label="Estado"
              anyLabel="Activos e inactivos"
              options={[
                { value: 'active', label: 'Solo activos' },
                { value: 'inactive', label: 'Solo inactivos' },
              ]}
            />
            {canEdit && <CreateButton label="Nuevo ítem" onClick={navigation.openNew} />}
          </>
        }
        empty={
          text === '' ? 'Todavía no hay ítems en este catálogo.' : 'No hay ítems con ese nombre.'
        }
      />
      <FeatureSheet navigation={navigation} rows={data.rows} kind={kind} readOnly={!canEdit} />
    </>
  );
}

// ---------- Etiquetas ----------

function useConfirm(): readonly [ReactNode, (action: PendingAction) => void] {
  const [pending, setPending] = useState<PendingAction | undefined>();
  const dialog = (
    <ConfirmActionDialog
      copy={pending?.copy}
      run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
      onOpenChange={(open) => {
        if (!open) setPending(undefined);
      }}
    />
  );
  return [dialog, setPending] as const;
}

export function TagGroupsGrid({
  data,
  text,
  canEdit,
}: {
  readonly data: Paged<TagGroupRow>;
  readonly text: string;
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const [dialog, confirm] = useConfirm();
  const columns = useMemo(
    (): readonly DataTableColumn<TagGroupRow>[] => [
      {
        id: 'name',
        header: 'Grupo',
        sortable: true,
        className: 'font-medium',
        cell: (row) => row.name,
      },
      {
        id: 'tagCount',
        header: 'Etiquetas',
        className: 'w-[120px] tabular-nums',
        cell: (row) => row.tagCount,
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) => (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label={canEdit ? 'Renombrar' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
            {canEdit && (
              <RowAction
                icon={Trash2Icon}
                label="Borrar"
                destructive
                onClick={() => {
                  confirm({
                    copy: {
                      title: 'Borrar grupo',
                      description: `"${row.name}" se borra. Solo se puede si no tiene etiquetas.`,
                      confirm: 'Borrar',
                      done: 'Grupo borrado',
                      destructive: true,
                    },
                    run: () => deleteTagGroupAction({ groupId: row.id }),
                  });
                }}
              />
            )}
          </RowActions>
        ),
      },
    ],
    [canEdit, confirm, navigation],
  );

  return (
    <>
      <ServerDataTable
        label="Grupos de etiquetas"
        columns={columns}
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sort={data.sort}
        getRowId={getRowId}
        toolbar={
          <>
            <NameSearchToolbar text={text} view="active" canSeeTrash={false} activeLabel="Grupos" />
            {canEdit && <CreateButton label="Nuevo grupo" onClick={navigation.openNew} />}
          </>
        }
        empty="Todavía no hay grupos de etiquetas."
      />
      <TagGroupSheet navigation={navigation} rows={data.rows} readOnly={!canEdit} />
      {dialog}
    </>
  );
}

export function TagsGrid({
  data,
  text,
  group,
  groups,
  canEdit,
}: {
  readonly data: Paged<TagRow>;
  readonly text: string;
  /** Filtro por grupo: un ID, `none` (sin grupo) o todos. */
  readonly group: string | undefined;
  /** La primera página de grupos, para el filtro. */
  readonly groups: readonly TagGroupRow[];
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const [dialog, confirm] = useConfirm();
  const columns = useMemo(
    (): readonly DataTableColumn<TagRow>[] => [
      {
        id: 'name',
        header: 'Etiqueta',
        sortable: true,
        className: 'font-medium',
        cell: (row) => row.name,
      },
      {
        id: 'group',
        header: 'Grupo',
        showFrom: 'sm',
        className: 'text-muted-foreground',
        cell: (row) => row.groupName ?? 'Sin grupo',
      },
      {
        id: 'uses',
        header: 'En uso',
        className: 'w-[100px] tabular-nums',
        cell: (row) => row.uses,
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) => (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label={canEdit ? 'Editar' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
            {canEdit && (
              <RowAction
                icon={Trash2Icon}
                label="Borrar"
                destructive
                onClick={() => {
                  confirm({
                    copy: {
                      title: 'Borrar etiqueta',
                      description: `"${row.name}" se borra. Solo se puede si ninguna propiedad la tiene.`,
                      confirm: 'Borrar',
                      done: 'Etiqueta borrada',
                      destructive: true,
                    },
                    run: () => deleteTagAction({ tagId: row.id }),
                  });
                }}
              />
            )}
          </RowActions>
        ),
      },
    ],
    [canEdit, confirm, navigation],
  );

  return (
    <>
      <ServerDataTable
        label="Etiquetas de propiedades"
        columns={columns}
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sort={data.sort}
        getRowId={getRowId}
        toolbar={
          <>
            <NameSearchToolbar
              text={text}
              view="active"
              canSeeTrash={false}
              activeLabel="Etiquetas"
            />
            <ParamSelect
              param="group"
              value={group}
              label="Grupo"
              anyLabel="Todos los grupos"
              options={[
                { value: NO_TAG_GROUP, label: 'Sin grupo' },
                ...groups.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
            {canEdit && <CreateButton label="Nueva etiqueta" onClick={navigation.openNew} />}
          </>
        }
        empty={text === '' ? 'Todavía no hay etiquetas.' : 'No hay etiquetas con ese nombre.'}
      />
      <TagSheet navigation={navigation} rows={data.rows} readOnly={!canEdit} />
      {dialog}
    </>
  );
}
