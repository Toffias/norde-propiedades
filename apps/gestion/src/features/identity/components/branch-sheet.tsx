'use client';

import {
  CreateBranchInputSchema,
  type BranchDetail,
  type CreateBranchInput,
} from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
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
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@norde/ui/components/tabs';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import type { PanelData } from '../../../lib/panel-params';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { contractResolver } from '../../../lib/form';
import { createBranchAction, updateBranchAction } from '../actions';
import { branchTab, type PanelUsersPage } from '../panels';
import { BranchUsersGrid } from './branch-users-grid';

/** Lo que se edita de una sucursal: el alta y la edición usan los mismos campos del contract. */
type BranchValues = CreateBranchInput;

const TEXT_FIELDS: readonly {
  readonly name: Exclude<keyof BranchValues, 'name'>;
  readonly label: string;
  readonly type?: string;
  readonly description?: string;
}[] = [
  { name: 'address', label: 'Dirección' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Teléfono', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  {
    name: 'logoUrl',
    label: 'Logo (URL)',
    type: 'url',
    description: 'Se usa en los portales y en las fichas en PDF.',
  },
];

function initialValues(branch: BranchDetail | undefined): BranchValues {
  return {
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    email: branch?.email ?? '',
    phone: branch?.phone ?? '',
    whatsapp: branch?.whatsapp ?? '',
    logoUrl: branch?.logoUrl ?? '',
  };
}

export interface BranchSheetData {
  readonly branch: BranchDetail;
  /** Solo con la pestaña "Usuarios" abierta. */
  readonly users: PanelData<PanelUsersPage> | undefined;
}

/** Alta y edición de una sucursal en el panel lateral: sus datos y sus usuarios. */
export function BranchSheet({
  navigation,
  detail,
  canEdit,
}: {
  readonly navigation: PanelNavigation;
  /** La sucursal del panel de edición, cargada por la página. */
  readonly detail: PanelData<BranchSheetData> | undefined;
  /** `branches:update`: sin él, los datos se ven pero no se cambian. */
  readonly canEdit: boolean;
}) {
  const { panel, close, setTab, setPanelPage, pending } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;
  const tab = branchTab(shown?.kind === 'edit' ? shown.tab : undefined);

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width={creating ? 'default' : 'wide'}
      title={creating ? 'Nueva sucursal' : canEdit ? 'Editar sucursal' : 'Sucursal'}
      description={
        creating
          ? 'Los datos de contacto aparecen en los portales y en las fichas en PDF.'
          : ready?.ok === true
            ? ready.value.branch.name
            : undefined
      }
    >
      {creating ? (
        <BranchForm key="new" branch={undefined} readOnly={false} onDone={close} />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(branchTab(next));
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-2">
            <TabsList>
              <TabsTrigger value="details">Datos</TabsTrigger>
              <TabsTrigger value="users">Usuarios</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="details" className="flex min-h-0 flex-1 flex-col">
            <BranchForm
              key={ready.id}
              branch={ready.value.branch}
              readOnly={!canEdit}
              onDone={close}
            />
          </TabsContent>
          <TabsContent value="users" className="flex min-h-0 flex-1 flex-col">
            <SheetBody scroll className="p-0">
              {ready.value.users === undefined ? (
                <SheetLoading />
              ) : ready.value.users.ok ? (
                <BranchUsersGrid
                  rows={ready.value.users.value.rows}
                  total={ready.value.users.value.total}
                  page={ready.value.users.value.page}
                  pageSize={ready.value.users.value.pageSize}
                  pending={pending}
                  onPageChange={setPanelPage}
                />
              ) : (
                <SheetError message={ready.value.users.message} />
              )}
            </SheetBody>
          </TabsContent>
        </Tabs>
      )}
    </EntitySheet>
  );
}

/** Formulario de una sucursal: alta (sin `branch`) o edición. */
function BranchForm({
  branch,
  readOnly,
  onDone,
}: {
  readonly branch: BranchDetail | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<BranchValues>({
    resolver: contractResolver(CreateBranchInputSchema),
    defaultValues: initialValues(branch),
  });

  async function submit(values: BranchValues) {
    setError(undefined);
    const message = await runAction(() =>
      branch === undefined
        ? createBranchAction(values)
        : updateBranchAction({ branchId: branch.id, ...values }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(branch === undefined ? 'Sucursal creada' : 'Cambios guardados');
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll>
          <FormAlert message={error} />
          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {TEXT_FIELDS.map(({ name, label, type, description }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem
                      className={name === 'address' || name === 'logoUrl' ? 'sm:col-span-2' : ''}
                    >
                      <FormLabel>{label} (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type={type ?? 'text'}
                          autoComplete="off"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      {description !== undefined && (
                        <FormDescription>{description}</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </fieldset>
        </SheetBody>
        {!readOnly && (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {branch === undefined ? 'Crear sucursal' : 'Guardar cambios'}
            </Button>
          </SheetFooter>
        )}
      </form>
    </Form>
  );
}
