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
import { Card } from '@norde/ui/components/card';
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
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { createRoleAction, updateRoleAction } from '../actions';
import { FormAlert } from './form-alert';
import { PermissionPicker, type CatalogGroup } from './permission-picker';

const ROLES = '/mi-empresa/roles';

export function CreateRoleEditor({ catalog }: { readonly catalog: readonly CatalogGroup[] }) {
  const router = useRouter();
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
    router.push(ROLES);
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
        <RoleFields catalog={catalog} system={false} />
        <Actions pending={form.formState.isSubmitting} label="Crear rol" />
      </form>
    </Form>
  );
}

export function EditRoleEditor({
  role,
  catalog,
  readOnly,
}: {
  readonly role: RoleDetail;
  readonly catalog: readonly CatalogGroup[];
  /** Sin `roles:update` se ve, pero no se edita. */
  readonly readOnly: boolean;
}) {
  const router = useRouter();
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
    router.push(ROLES);
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        {role.isSystem && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="info">Rol del sistema</Badge>
            No se renombra ni se borra; sus permisos sí se pueden ajustar.
          </p>
        )}
        <FormAlert message={error} />
        <RoleFields catalog={catalog} system={role.isSystem} readOnly={readOnly} />
        {!readOnly && <Actions pending={form.formState.isSubmitting} label="Guardar cambios" />}
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
      <Card className="flex flex-col gap-4 p-4">
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
      </Card>
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

function Actions({ pending, label }: { readonly pending: boolean; readonly label: string }) {
  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background py-3">
      <Button type="button" variant="outline" asChild>
        <Link href={ROLES}>Cancelar</Link>
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
