'use client';

import {
  CreateClientTagGroupInputSchema,
  CreateClientTagInputSchema,
  NO_CLIENT_TAG_GROUP,
  type ClientTagGroupRow,
  type ClientTagRow,
  type CreateClientTagGroupInput,
  type CreateClientTagInput,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { CombineIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  useId,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { EntityPicker } from '../../identity/components/entity-picker';
import { NameSearchToolbar } from '../../identity/components/list-toolbar';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import {
  EntitySheet,
  SheetError,
  useLastDefined,
  usePanel,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import {
  createClientTagAction,
  createClientTagGroupAction,
  deleteClientTagAction,
  deleteClientTagGroupAction,
  loadClientTagGroupOptions,
  loadClientTagOptions,
  mergeClientTagsAction,
  renameClientTagGroupAction,
  updateClientTagAction,
} from '../tag-actions';

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

const NOT_ON_PAGE =
  'No está en la página que estás viendo. Buscalo en la grilla y abrilo desde ahí.';

function getRowId(row: { readonly id: string }): string {
  return row.id;
}

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

/** El ítem del panel de edición, si está en la página que se ve. */
function useEditing<T extends { readonly id: string }>(
  navigation: PanelNavigation,
  rows: readonly T[],
): { readonly creating: boolean; readonly item: T | undefined; readonly missing: boolean } {
  const shown = useLastDefined(navigation.panel);
  const creating = shown?.kind === 'new';
  const item = shown?.kind === 'edit' ? rows.find((row) => row.id === shown.id) : undefined;
  return { creating, item, missing: shown?.kind === 'edit' && item === undefined };
}

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

/** Cuerpo y botones de un formulario del panel lateral, con su error y el envío. */
function SheetForm<T extends FieldValues>({
  form,
  submit,
  done,
  onDone,
  readOnly,
  children,
}: {
  readonly form: UseFormReturn<T>;
  readonly submit: (values: T) => Promise<ActionResult>;
  readonly done: string;
  readonly onDone: () => void;
  readonly readOnly: boolean;
  readonly children: ReactNode;
}) {
  const [error, setError] = useState<string | undefined>();
  const pending = form.formState.isSubmitting;

  async function send(values: T) {
    setError(undefined);
    const message = await runAction(() => submit(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(done);
    onDone();
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(send)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-5">
          <FormAlert message={error} />
          {children}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </SheetFooter>
      </form>
    </Form>
  );
}

/** El campo de nombre de los dos formularios. */
function nameInput(
  field: { readonly name: string; readonly value: string | undefined } & Omit<
    ComponentProps<typeof Input>,
    'value'
  >,
  readOnly: boolean,
) {
  return (
    <FormItem>
      <FormLabel>Nombre</FormLabel>
      <FormControl>
        <Input
          autoComplete="off"
          autoFocus
          readOnly={readOnly}
          {...field}
          value={field.value ?? ''}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

// ---------- Grupos ----------

function TagGroupSheet({
  navigation,
  rows,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly ClientTagGroupRow[];
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? 'Nuevo grupo de etiquetas' : 'Grupo de etiquetas'}
      description={creating ? 'Después sumale etiquetas desde la pestaña Etiquetas.' : item?.name}
    >
      {creating || item !== undefined ? (
        <TagGroupForm
          key={item?.id ?? 'new'}
          group={item}
          readOnly={readOnly}
          onDone={navigation.close}
        />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : null}
    </EntitySheet>
  );
}

function TagGroupForm({
  group,
  readOnly,
  onDone,
}: {
  readonly group: ClientTagGroupRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateClientTagGroupInput>({
    resolver: contractResolver(CreateClientTagGroupInputSchema),
    defaultValues: { name: group?.name ?? '' },
  });
  return (
    <SheetForm
      form={form}
      submit={(values) =>
        group === undefined
          ? createClientTagGroupAction(values)
          : renameClientTagGroupAction({ groupId: group.id, name: values.name })
      }
      done={group === undefined ? 'Grupo creado' : 'Grupo actualizado'}
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
    </SheetForm>
  );
}

export function ClientTagGroupsGrid({
  data,
  text,
  canEdit,
}: {
  readonly data: Paged<ClientTagGroupRow>;
  readonly text: string;
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const [dialog, confirm] = useConfirm();
  const columns = useMemo(
    (): readonly DataTableColumn<ClientTagGroupRow>[] => [
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
        className: 'w-[110px] tabular-nums',
        cell: (row) => row.tagCount,
      },
      {
        id: 'clientCount',
        header: 'Contactos',
        className: 'w-[110px] tabular-nums',
        cell: (row) => row.clientCount.toLocaleString('es-AR'),
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
                    run: () => deleteClientTagGroupAction({ groupId: row.id }),
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
        label="Grupos de etiquetas de contactos"
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

// ---------- Etiquetas ----------

function TagSheet({
  navigation,
  rows,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly ClientTagRow[];
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? 'Nueva etiqueta' : 'Etiqueta'}
      description={creating ? 'Ordena la agenda y sirve como filtro.' : item?.name}
    >
      {creating || item !== undefined ? (
        <TagForm key={item?.id ?? 'new'} tag={item} readOnly={readOnly} onDone={navigation.close} />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : null}
    </EntitySheet>
  );
}

function TagForm({
  tag,
  readOnly,
  onDone,
}: {
  readonly tag: ClientTagRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateClientTagInput>({
    resolver: contractResolver(CreateClientTagInputSchema),
    defaultValues: {
      name: tag?.name ?? '',
      ...(tag?.groupId === undefined ? {} : { groupId: tag.groupId }),
    },
  });
  return (
    <SheetForm
      form={form}
      submit={(values) =>
        tag === undefined
          ? createClientTagAction(values)
          : updateClientTagAction({ ...values, tagId: tag.id })
      }
      done={tag === undefined ? 'Etiqueta creada' : 'Etiqueta actualizada'}
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
      <FormField
        control={form.control}
        name="groupId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Grupo</FormLabel>
            <FormControl>
              <EntityPicker
                value={field.value}
                initial={
                  tag?.groupId === undefined || tag.groupName === undefined
                    ? undefined
                    : { value: tag.groupId, label: tag.groupName }
                }
                onChange={field.onChange}
                loadPage={loadClientTagGroupOptions}
                placeholder="Sin grupo"
                searchPlaceholder="Buscar grupo"
                {...(readOnly ? {} : { clearLabel: 'Quitar del grupo' })}
              />
            </FormControl>
            <FormDescription>
              Cambiar el grupo mueve la etiqueta; los contactos la conservan.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SheetForm>
  );
}

/** Unificar: los contactos de la etiqueta pasan a otra y esta se borra. */
function MergeTagDialog({
  tag,
  onClose,
}: {
  readonly tag: ClientTagRow | undefined;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [target, setTarget] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function close() {
    setTarget(undefined);
    setError(undefined);
    onClose();
  }

  function merge() {
    if (tag === undefined || target === undefined) return;
    startTransition(async () => {
      let moved = 0;
      const message = await runAction(async () => {
        const result = await mergeClientTagsAction({
          sourceTagId: tag.id,
          targetTagId: target,
        });
        moved = result.ok ? (result.moved ?? 0) : 0;
        return result;
      });
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(
        moved === 1
          ? 'Etiquetas unificadas: se movió 1 contacto'
          : `Etiquetas unificadas: se movieron ${moved.toLocaleString('es-AR')} contactos`,
      );
      close();
    });
  }

  return (
    <Dialog
      open={tag !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unificar etiqueta</DialogTitle>
          <DialogDescription>
            Los contactos con «{tag?.name}» pasan a la etiqueta que elijas y «{tag?.name}» se borra.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-target`}>Unificar con</Label>
          <EntityPicker
            id={`${id}-target`}
            value={target}
            initial={undefined}
            onChange={setTarget}
            loadPage={loadClientTagOptions}
            placeholder="Elegí la etiqueta que queda"
            searchPlaceholder="Buscar etiqueta"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || target === undefined || target === tag?.id}
            onClick={merge}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Unificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupFilter({
  value,
  groups,
}: {
  readonly value: string | undefined;
  readonly groups: readonly ClientTagGroupRow[];
}) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={value ?? 'any'}
      onValueChange={(next) => {
        setParams({ group: next === 'any' ? undefined : next });
      }}
    >
      <SelectTrigger className="w-full sm:w-[190px]" aria-label="Grupo">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">Todos los grupos</SelectItem>
        <SelectItem value={NO_CLIENT_TAG_GROUP}>Sin grupo</SelectItem>
        {groups.map((group) => (
          <SelectItem key={group.id} value={group.id}>
            {group.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ClientTagsGrid({
  data,
  text,
  group,
  groups,
  canEdit,
}: {
  readonly data: Paged<ClientTagRow>;
  readonly text: string;
  /** Filtro por grupo: un ID, `none` (sin grupo) o todos. */
  readonly group: string | undefined;
  /** La primera página de grupos, para el filtro. */
  readonly groups: readonly ClientTagGroupRow[];
  readonly canEdit: boolean;
}) {
  const navigation = usePanel();
  const [dialog, confirm] = useConfirm();
  const [merging, setMerging] = useState<ClientTagRow | undefined>();
  const columns = useMemo(
    (): readonly DataTableColumn<ClientTagRow>[] => [
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
        id: 'clients',
        header: 'Contactos',
        className: 'w-[110px] tabular-nums',
        cell: (row) => row.clients.toLocaleString('es-AR'),
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
              label={canEdit ? 'Editar o mover' : 'Ver'}
              onClick={() => {
                navigation.openEdit(row.id);
              }}
            />
            {canEdit && (
              <RowAction
                icon={CombineIcon}
                label="Unificar con otra"
                onClick={() => {
                  setMerging(row);
                }}
              />
            )}
            {canEdit && (
              <RowAction
                icon={Trash2Icon}
                label="Borrar"
                destructive
                onClick={() => {
                  confirm({
                    copy: {
                      title: 'Borrar etiqueta',
                      description: `"${row.name}" se borra. Solo se puede si ningún contacto la tiene; si no, unificala con otra.`,
                      confirm: 'Borrar',
                      done: 'Etiqueta borrada',
                      destructive: true,
                    },
                    run: () => deleteClientTagAction({ tagId: row.id }),
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
        label="Etiquetas de contactos"
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
            <GroupFilter value={group} groups={groups} />
            {canEdit && <CreateButton label="Nueva etiqueta" onClick={navigation.openNew} />}
          </>
        }
        empty={text === '' ? 'Todavía no hay etiquetas.' : 'No hay etiquetas con ese nombre.'}
      />
      <TagSheet navigation={navigation} rows={data.rows} readOnly={!canEdit} />
      <MergeTagDialog
        tag={merging}
        onClose={() => {
          setMerging(undefined);
        }}
      />
      {dialog}
    </>
  );
}
