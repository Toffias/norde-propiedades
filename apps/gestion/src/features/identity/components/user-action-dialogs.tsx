'use client';

import {
  ResetUserPasswordInputSchema,
  type ResetUserPasswordInput,
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
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { reactivateUserAction, resetUserPasswordAction, suspendUserAction } from '../actions';
import { generateTemporaryPassword } from '../temporary-password';
import { FormAlert } from '../../shared/components/form-alert';

/** Suspender o reactivar: una confirmación, porque suspender cierra sus sesiones al instante. */
export function UserStatusDialog({
  user,
  onOpenChange,
}: {
  readonly user: UserListItem | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const suspending = user?.status === 'active';
  const name = user?.name ?? '';

  function close(next: boolean) {
    if (!next) setError(undefined);
    onOpenChange(next);
  }

  function confirm() {
    if (!user) return;
    startTransition(async () => {
      const input = { userId: user.id };
      const message = await runAction(() =>
        suspending ? suspendUserAction(input) : reactivateUserAction(input),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(suspending ? 'Usuario suspendido' : 'Usuario reactivado');
      close(false);
    });
  }

  return (
    <Dialog open={user !== undefined} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{suspending ? 'Suspender usuario' : 'Reactivar usuario'}</DialogTitle>
          <DialogDescription>
            {suspending
              ? `${name} deja de tener acceso al panel y se cierran sus sesiones abiertas. Sus datos y su historial no se tocan.`
              : `${name} vuelve a poder entrar al panel con su contraseña.`}
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
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
          <Button
            type="button"
            variant={suspending ? 'destructive' : 'default'}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {suspending ? 'Suspender' : 'Reactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Blanqueo: el administrador pone una contraseña temporal y se la pasa al usuario. */
export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  readonly user: UserListItem | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={user !== undefined} onOpenChange={onOpenChange}>
      <DialogContent>
        {user && (
          <ResetPasswordForm
            key={user.id}
            user={user}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordForm({
  user,
  onDone,
}: {
  readonly user: UserListItem;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<ResetUserPasswordInput>({
    resolver: contractResolver(ResetUserPasswordInputSchema),
    defaultValues: { userId: user.id, temporaryPassword: generateTemporaryPassword() },
  });

  async function submit(values: ResetUserPasswordInput) {
    setError(undefined);
    const message = await runAction(() => resetUserPasswordAction(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success('Contraseña blanqueada', {
      description: `Pasale la contraseña temporal a ${user.name}: la va a cambiar al entrar.`,
    });
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Blanquear contraseña</DialogTitle>
        <DialogDescription>
          {user.name} va a tener que entrar con esta contraseña y elegir una nueva. Se cierran sus
          sesiones abiertas.
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
                    Generar otra
                  </Button>
                </div>
                <FormDescription>Al menos 10 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Blanquear
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
