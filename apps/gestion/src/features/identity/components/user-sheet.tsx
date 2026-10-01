'use client';

import {
  CreateUserInputSchema,
  UpdateUserInputSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UserListItem,
  type UserPermissionsDetail,
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
import { Loader2Icon, WandSparklesIcon } from 'lucide-react';
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
import { FormAlert } from '../../shared/components/form-alert';
import { createUserAction, loadBranchOptions, updateUserAction } from '../actions';
import { userTab } from '../panels';
import { generateTemporaryPassword } from '../temporary-password';
import { EntityPicker } from './entity-picker';
import type { CatalogGroup } from './permission-picker';
import { RoleCheckboxes, type RoleOption } from './role-checkboxes';
import { UserPermissionsEditor } from './user-permissions-editor';

export interface UserSheetData {
  readonly user: UserListItem;
  /** Solo con la pestaña "Permisos propios" abierta. */
  readonly permissions: PanelData<UserPermissionsDetail> | undefined;
}

/** Qué pestañas del panel puede usar quien lo mira: solo para no mostrar lo que va a fallar. */
export interface UserSheetAccess {
  readonly update: boolean;
  readonly permissions: boolean;
  /** El usuario de la sesión: no puede cambiar sus propios permisos. */
  readonly currentUserId: string;
}

/** Alta y edición de un usuario en el panel lateral: sus datos y sus permisos propios. */
export function UserSheet({
  navigation,
  detail,
  roles,
  catalog,
  access,
}: {
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<UserSheetData> | undefined;
  readonly roles: readonly RoleOption[];
  readonly catalog: readonly CatalogGroup[];
  readonly access: UserSheetAccess;
}) {
  const { panel, close, setTab } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;
  const withPermissions = access.permissions && ready?.id !== access.currentUserId;
  const tab = withPermissions ? userTab(shown?.kind === 'edit' ? shown.tab : undefined) : 'details';

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width={creating ? 'default' : 'wide'}
      title={creating ? 'Nuevo usuario' : access.update ? 'Editar usuario' : 'Usuario'}
      description={
        creating
          ? 'Va a entrar con la contraseña temporal y elegir una propia.'
          : ready?.ok === true
            ? `${ready.value.user.name} · ${ready.value.user.email}`
            : undefined
      }
    >
      {creating ? (
        <CreateUserForm key="new" roles={roles} onDone={close} />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(userTab(next));
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {withPermissions && (
            <div className="border-b border-border px-4 py-2">
              <TabsList>
                <TabsTrigger value="details">Datos</TabsTrigger>
                <TabsTrigger value="permissions">Permisos propios</TabsTrigger>
              </TabsList>
            </div>
          )}
          <TabsContent value="details" className="flex min-h-0 flex-1 flex-col">
            <EditUserForm
              key={ready.id}
              user={ready.value.user}
              roles={roles}
              readOnly={!access.update}
              onDone={close}
            />
          </TabsContent>
          {withPermissions && (
            <TabsContent value="permissions" className="flex min-h-0 flex-1 flex-col">
              {ready.value.permissions === undefined ? (
                <SheetLoading />
              ) : ready.value.permissions.ok ? (
                <UserPermissionsEditor
                  key={ready.id}
                  userId={ready.id}
                  catalog={catalog}
                  fromRoles={ready.value.permissions.value.grantedByRoles}
                  own={ready.value.permissions.value.ownPermissions}
                  onDone={close}
                />
              ) : (
                <SheetError message={ready.value.permissions.message} />
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </EntitySheet>
  );
}

function CreateUserForm({
  roles,
  onDone,
}: {
  readonly roles: readonly RoleOption[];
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<CreateUserInput>({
    resolver: contractResolver(CreateUserInputSchema),
    defaultValues: { name: '', email: '', phone: '', roleIds: [], temporaryPassword: '' },
  });

  async function submit(values: CreateUserInput) {
    setError(undefined);
    const message = await runAction(() => createUserAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Usuario creado', {
      description: 'Pasale la contraseña temporal: la va a cambiar en su primer ingreso.',
    });
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
          <ProfileFields roles={roles} />
          <FormField
            control={form.control}
            name="temporaryPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contraseña temporal</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} {...field} />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      form.setValue('temporaryPassword', generateTemporaryPassword(), {
                        shouldValidate: true,
                      });
                    }}
                  >
                    <WandSparklesIcon className="h-4 w-4" />
                    Generar
                  </Button>
                </div>
                <FormDescription>Al menos 10 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Crear usuario
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}

function editValues(user: UserListItem): UpdateUserInput {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    ...(user.branch === undefined ? {} : { branchId: user.branch.id }),
    roleIds: user.roles.map((role) => role.id),
  };
}

function EditUserForm({
  user,
  roles,
  readOnly,
  onDone,
}: {
  readonly user: UserListItem;
  readonly roles: readonly RoleOption[];
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UpdateUserInput>({
    resolver: contractResolver(UpdateUserInputSchema),
    defaultValues: editValues(user),
  });

  async function submit(values: UpdateUserInput) {
    setError(undefined);
    const message = await runAction(() => updateUserAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Cambios guardados');
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
            <ProfileFields
              roles={roles}
              initialBranch={
                user.branch === undefined
                  ? undefined
                  : { value: user.branch.id, label: user.branch.name }
              }
            />
          </fieldset>
        </SheetBody>
        {!readOnly && (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </SheetFooter>
        )}
      </form>
    </Form>
  );
}

/** Lo que comparten el alta y la edición. */
type ProfileValues = Pick<CreateUserInput, 'name' | 'email' | 'phone' | 'branchId' | 'roleIds'>;

/** Campos del alta y de la edición: se leen del `<Form>` que los contiene. */
function ProfileFields({
  roles,
  initialBranch,
}: {
  readonly roles: readonly RoleOption[];
  readonly initialBranch?: { readonly value: string; readonly label: string } | undefined;
}) {
  const { control } = useFormContext<ProfileValues>();

  return (
    <>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre y apellido</FormLabel>
            <FormControl>
              <Input autoComplete="off" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono (opcional)</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="off" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="branchId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sucursal (opcional)</FormLabel>
            <FormControl>
              <EntityPicker
                value={field.value}
                initial={initialBranch}
                onChange={field.onChange}
                loadPage={loadBranchOptions}
                placeholder="Sin sucursal"
                searchPlaceholder="Buscar sucursal"
                clearLabel="Quitar la sucursal"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="roleIds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Roles</FormLabel>
            <RoleCheckboxes roles={roles} value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
