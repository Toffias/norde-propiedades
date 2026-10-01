'use client';

import {
  CreateRoleInputSchema,
  UpdateRoleInputSchema,
  type CreateRoleInput,
  type RoleDetail,
  type UpdateRoleInput,
} from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
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
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import type { PanelData } from '../../../lib/panel-params';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { createRoleAction, updateRoleAction } from '../actions';
import { FormAlert } from '../../shared/components/form-alert';
import { PermissionPicker, type CatalogGroup } from './permission-picker';

/** Alta y edición de un rol en el panel lateral. Sin `roles:update` se ve, pero no se edita. */
export function RoleSheet({
  navigation,
  detail,
  catalog,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<RoleDetail> | undefined;
  readonly catalog: readonly CatalogGroup[];
  readonly readOnly: boolean;
}) {
  const { panel, close } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width="wide"
      title={creating ? 'Nuevo rol' : readOnly ? 'Permisos del rol' : 'Editar rol'}
      description={
        creating
          ? 'Un usuario puede tener varios roles: sus permisos se suman.'
          : ready?.ok === true
            ? ready.value.name
            : undefined
      }
    >
      {creating ? (
        <CreateRoleForm key="new" catalog={catalog} onDone={close} />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : ready.ok ? (
        <EditRoleForm
          key={ready.id}
          role={ready.value}
          catalog={catalog}
          readOnly={readOnly}
          onDone={close}
        />
      ) : (
        <SheetError message={ready.message} />
      )}
    </EntitySheet>
  );
}

function CreateRoleForm({
  catalog,
  onDone,
}: {
  readonly catalog: readonly CatalogGroup[];
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<CreateRoleInput>({
    resolver: contractResolver(CreateRoleInputSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  async function submit(values: CreateRoleInput) {
    setError(undefined);
    const message = await runAction(() => createRoleAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Rol creado');
    onDone();
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll>
          <FormAlert message={error} />
          <RoleFields catalog={catalog} system={false} />
        </SheetBody>
        <Actions pending={form.formState.isSubmitting} label="Crear rol" onCancel={onDone} />
      </form>
    </Form>
  );
}

function EditRoleForm({
  role,
  catalog,
  readOnly,
  onDone,
}: {
  readonly role: RoleDetail;
  readonly catalog: readonly CatalogGroup[];
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdateRoleInput>({
    resolver: contractResolver(UpdateRoleInputSchema),
    defaultValues: {
      roleId: role.id,
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    },
  });

  async function submit(values: UpdateRoleInput) {
    setError(undefined);
    const message = await runAction(() => updateRoleAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Cambios guardados', {
      description: 'Los usuarios con este rol los tienen desde su próxima acción.',
    });
    onDone();
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll>
          {role.isSystem && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="info">Rol del sistema</Badge>
              No se renombra ni se borra; sus permisos sí se pueden ajustar.
            </p>
          )}
          <FormAlert message={error} />
          <RoleFields catalog={catalog} system={role.isSystem} readOnly={readOnly} />
        </SheetBody>
        {!readOnly && (
          <Actions
            pending={form.formState.isSubmitting}
            label="Guardar cambios"
            onCancel={onDone}
          />
        )}
      </form>
    </Form>
  );
}

type RoleValues = Pick<CreateRoleInput, 'name' | 'description' | 'permissions'>;

/** Lo que comparten el alta y la edición: se leen del `<Form>` que los contiene. */
function RoleFields({
  catalog,
  system,
  readOnly = false,
}: {
  readonly catalog: readonly CatalogGroup[];
  readonly system: boolean;
  readonly readOnly?: boolean;
}) {
  const { control } = useFormContext<RoleValues>();

  return (
    <>
      <div className="flex flex-col gap-4">
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input autoComplete="off" disabled={system || readOnly} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción (opcional)</FormLabel>
              <FormControl>
                <Textarea rows={2} disabled={readOnly} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormDescription>Qué hace quien tiene este rol.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="permissions"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Permisos</FormLabel>
            <PermissionPicker
              catalog={catalog}
              value={field.value}
              onChange={field.onChange}
              disabled={readOnly}
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

function Actions({
  pending,
  label,
  onCancel,
}: {
  readonly pending: boolean;
  readonly label: string;
  readonly onCancel: () => void;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
    </SheetFooter>
  );
}
