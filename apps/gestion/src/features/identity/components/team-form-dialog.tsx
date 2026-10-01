'use client';

import {
  CreateTeamInputSchema,
  type CreateTeamInput,
  type TeamListItem,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { createTeamAction, loadBranchOptions, updateTeamAction } from '../actions';
import { EntityPicker } from './entity-picker';
import { FormAlert } from '../../shared/components/form-alert';

/** Alta (sin `team`) o edición de un equipo: nombre y sucursal. */
export function TeamFormDialog({
  open,
  team,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly team: TeamListItem | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team === undefined ? 'Nuevo equipo' : 'Editar equipo'}</DialogTitle>
          <DialogDescription>
            Los miembros se agregan desde la pantalla del equipo.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <TeamForm
            key={team?.id ?? 'new'}
            team={team}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamForm({
  team,
  onDone,
}: {
  readonly team: TeamListItem | undefined;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<CreateTeamInput>({
    resolver: contractResolver(CreateTeamInputSchema),
    defaultValues: {
      name: team?.name ?? '',
      ...(team?.branch === undefined ? {} : { branchId: team.branch.id }),
    },
  });

  async function submit(values: CreateTeamInput) {
    setError(undefined);
    const message = await runAction(() =>
      team === undefined
        ? createTeamAction(values)
        : updateTeamAction({ teamId: team.id, ...values }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(team === undefined ? 'Equipo creado' : 'Cambios guardados');
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
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
        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sucursal (opcional)</FormLabel>
              <FormControl>
                <EntityPicker
                  value={field.value}
                  initial={
                    team?.branch === undefined
                      ? undefined
                      : { value: team.branch.id, label: team.branch.name }
                  }
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {team === undefined ? 'Crear equipo' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
