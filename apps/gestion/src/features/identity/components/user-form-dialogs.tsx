'use client';

import {
  CreateUserInputSchema,
  UpdateUserInputSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UserListItem,
} from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
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
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, WandSparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { createUserAction, loadBranchOptions, updateUserAction } from '../actions';
import { generateTemporaryPassword } from '../temporary-password';
import { EntityPicker } from './entity-picker';
import { FormAlert } from './form-alert';
import { RoleCheckboxes, type RoleOption } from './role-checkboxes';

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly roles: readonly RoleOption[];
}

export function CreateUserDialog({ open, onOpenChange, roles }: DialogProps) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<CreateUserInput>({
    resolver: contractResolver(CreateUserInputSchema),
    defaultValues: { name: '', email: '', phone: '', roleIds: [], temporaryPassword: '' },
  });

  function close(next: boolean) {
    if (!next) {
      form.reset();
      setError(undefined);
    }
    onOpenChange(next);
  }

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
    close(false);
  }

  const pending = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Va a entrar con la contraseña temporal y elegir una propia.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => void form.handleSubmit(submit)(event)}
          >
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Crear usuario
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
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

export function EditUserDialog({
  user,
  onOpenChange,
  roles,
}: Omit<DialogProps, 'open'> & { readonly user: UserListItem | undefined }) {
  return (
    <Dialog open={user !== undefined} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {user && (
          // Un formulario por usuario: arranca con sus datos.
          <EditUserForm
            key={user.id}
            user={user}
            roles={roles}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({
  user,
  roles,
  onDone,
}: {
  readonly user: UserListItem;
  readonly roles: readonly RoleOption[];
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
    <>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription>{user.email}</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
        >
          <FormAlert message={error} />
          <ProfileFields
            roles={roles}
            initialBranch={
              user.branch === undefined
                ? undefined
                : { value: user.branch.id, label: user.branch.name }
            }
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
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
