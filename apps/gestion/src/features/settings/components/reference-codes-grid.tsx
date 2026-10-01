'use client';

import { PROPERTY_TYPES } from '@norde/core/properties/contracts';
import {
  CreateReferenceCodeSequenceInputSchema,
  type CreateReferenceCodeSequenceInput,
  type DirectoryScope,
  type ReferenceCodeScopeValue,
  type ReferenceCodeSequenceRow,
} from '@norde/core/settings/contracts';
import { Badge } from '@norde/ui/components/badge';
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
import { PagedCombobox, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { FormAlert } from '../../shared/components/form-alert';
import {
  changeReferenceCodePrefixAction,
  createReferenceCodeSequenceAction,
  deleteReferenceCodeSequenceAction,
  searchDirectoryAction,
} from '../actions';

const SCOPE_LABELS: Readonly<Record<ReferenceCodeScopeValue, string>> = {
  global: 'General',
  property_type: 'Tipo de propiedad',
  branch: 'Sucursal',
  team: 'Equipo',
  user: 'Usuario',
};

const PROPERTY_TYPE_LABELS: Readonly<Record<(typeof PROPERTY_TYPES)[number], string>> = {
  apartment: 'Departamento',
  house: 'Casa',
  ph: 'PH',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local',
  garage: 'Cochera',
  warehouse: 'Galpón',
};

function isPropertyType(value: string): value is (typeof PROPERTY_TYPES)[number] {
  return PROPERTY_TYPES.some((type) => type === value);
}

function appliesTo(row: ReferenceCodeSequenceRow): string {
  if (row.scope === 'global') return 'Cuando no aplica ningún otro';
  if (row.scope === 'property_type') {
    return isPropertyType(row.scopeValue) ? PROPERTY_TYPE_LABELS[row.scopeValue] : row.scopeValue;
  }
  return row.scopeName ?? 'No encontrado';
}

/** Los alcances que se eligen al crear un prefijo (la general ya existe y no se repite). */
const NEW_SCOPES = ['property_type', 'user', 'team', 'branch'] as const;

function NewSequenceDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [target, setTarget] = useState<ComboboxOption | null>(null);
  const form = useForm<CreateReferenceCodeSequenceInput>({
    resolver: contractResolver(CreateReferenceCodeSequenceInputSchema),
    defaultValues: { scope: 'property_type', scopeValue: '', prefix: '' },
  });
  const scope = useWatch({ control: form.control, name: 'scope' });
  const directoryKind: DirectoryScope | undefined =
    scope === 'user' || scope === 'team' || scope === 'branch' ? scope : undefined;

  async function submit(values: CreateReferenceCodeSequenceInput) {
    setError(undefined);
    const message = await runAction(() => createReferenceCodeSequenceAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Prefijo agregado');
    form.reset();
    setTarget(null);
    onOpenChange(false);
    router.refresh();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo prefijo</DialogTitle>
          <DialogDescription>
            Si a un alta le aplican varios, gana el más específico: usuario, equipo, sucursal, tipo
            de propiedad y, por último, el general.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => void form.handleSubmit(submit)(event)}
          >
            <FormAlert message={error} />
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aplica a</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('scopeValue', '');
                      setTarget(null);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NEW_SCOPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SCOPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="scopeValue"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{scope === 'property_type' ? 'Tipo' : SCOPE_LABELS[scope]}</FormLabel>
                  {directoryKind === undefined ? (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Elegí un tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROPERTY_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {PROPERTY_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <FormControl>
                      <PagedCombobox
                        key={scope}
                        value={target}
                        aria-invalid={fieldState.invalid}
                        placeholder={`Elegí ${scope === 'user' ? 'un usuario' : scope === 'team' ? 'un equipo' : 'una sucursal'}`}
                        searchPlaceholder="Buscar por nombre…"
                        loadPage={(search, page) =>
                          searchDirectoryAction({
                            kind: directoryKind,
                            search,
                            page,
                            pageSize: 20,
                          })
                        }
                        onChange={(option) => {
                          setTarget(option);
                          field.onChange(option?.value ?? '');
                        }}
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prefijo</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={6}
                      autoCapitalize="characters"
                      placeholder="CAS"
                      className="uppercase"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    De 1 a 6 letras o números. Los códigos quedan CAS0001, CAS0002…
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
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
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditPrefixDialog({
  row,
  onClose,
}: {
  readonly row: ReferenceCodeSequenceRow;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(row.prefix);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(undefined);
    const message = await runAction(() =>
      changeReferenceCodePrefixAction({ sequenceId: row.id, prefix }),
    );
    setPending(false);
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Prefijo actualizado');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar el prefijo</DialogTitle>
          <DialogDescription>
            {SCOPE_LABELS[row.scope]}: {appliesTo(row)}. La numeración sigue donde estaba y los
            códigos ya entregados no cambian.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FormAlert message={error} />
          <Input
            aria-label="Prefijo"
            maxLength={6}
            className="uppercase"
            value={prefix}
            onChange={(event) => {
              setPrefix(event.target.value);
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ReferenceCodesGridProps {
  readonly rows: readonly ReferenceCodeSequenceRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly canUpdate: boolean;
}

function getRowId(row: ReferenceCodeSequenceRow): string {
  return row.id;
}

export function ReferenceCodesGrid({ canUpdate, ...page }: ReferenceCodesGridProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ReferenceCodeSequenceRow | undefined>();

  async function remove(row: ReferenceCodeSequenceRow) {
    const message = await runAction(() =>
      deleteReferenceCodeSequenceAction({ sequenceId: row.id }),
    );
    if (message !== undefined) {
      toast.error(message);
      return;
    }
    toast.success(`Prefijo ${row.prefix} borrado`);
    router.refresh();
  }

  const columns: readonly DataTableColumn<ReferenceCodeSequenceRow>[] = [
    {
      id: 'scope',
      header: 'Alcance',
      sortable: true,
      className: 'w-[160px]',
      cell: (row) => <Badge variant="outline">{SCOPE_LABELS[row.scope]}</Badge>,
    },
    {
      id: 'appliesTo',
      header: 'Aplica a',
      className: 'font-medium',
      cell: appliesTo,
    },
    {
      id: 'prefix',
      header: 'Prefijo',
      sortable: true,
      className: 'w-[110px] font-mono',
      cell: (row) => row.prefix,
    },
    {
      id: 'nextCode',
      header: 'Próximo código',
      showFrom: 'md',
      className: 'w-[150px] font-mono text-muted-foreground',
      cell: (row) => row.nextCode,
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-[90px] text-right',
      cell: (row) =>
        canUpdate ? (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label="Cambiar el prefijo"
              onClick={() => {
                setEditing(row);
              }}
            />
            {row.scope !== 'global' && (
              <RowAction
                icon={Trash2Icon}
                label="Borrar"
                onClick={() => {
                  void remove(row);
                }}
              />
            )}
          </RowActions>
        ) : null,
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Prefijos de códigos de referencia"
        columns={columns}
        getRowId={getRowId}
        {...page}
        toolbar={
          canUpdate ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreating(true);
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Nuevo prefijo
            </Button>
          ) : undefined
        }
        empty="Todavía no hay prefijos."
      />
      <NewSequenceDialog open={creating} onOpenChange={setCreating} />
      {editing && (
        <EditPrefixDialog
          row={editing}
          onClose={() => {
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}
