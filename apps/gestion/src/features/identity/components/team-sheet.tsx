'use client';

import {
  CreateTeamInputSchema,
  type CreateTeamInput,
  type TeamDetail,
} from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
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
import { createTeamAction, loadBranchOptions, updateTeamAction } from '../actions';
import { teamTab, type PanelUsersPage } from '../panels';
import { EntityPicker } from './entity-picker';
import { TeamMembersGrid } from './team-members-grid';

export interface TeamSheetData {
  readonly team: TeamDetail;
  /** Solo con la pestaña "Miembros" abierta. */
  readonly members: PanelData<PanelUsersPage> | undefined;
}

/** Alta y edición de un equipo en el panel lateral: sus datos y sus miembros. */
export function TeamSheet({
  navigation,
  detail,
  canEdit,
}: {
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<TeamSheetData> | undefined;
  /** `teams:update`: sin él, los datos y los miembros se ven pero no se cambian. */
  readonly canEdit: boolean;
}) {
  const { panel, close, setTab, setPanelPage, pending } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;
  const tab = teamTab(shown?.kind === 'edit' ? shown.tab : undefined);

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width={creating ? 'default' : 'wide'}
      title={creating ? 'Nuevo equipo' : canEdit ? 'Editar equipo' : 'Equipo'}
      description={
        creating
          ? 'Después de crearlo, sumale los miembros desde su panel.'
          : ready?.ok === true
            ? ready.value.team.name
            : undefined
      }
    >
      {creating ? (
        <TeamForm key="new" team={undefined} readOnly={false} onDone={close} />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(teamTab(next));
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-2">
            <TabsList>
              <TabsTrigger value="details">Datos</TabsTrigger>
              <TabsTrigger value="members">Miembros</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="details" className="flex min-h-0 flex-1 flex-col">
            <TeamForm key={ready.id} team={ready.value.team} readOnly={!canEdit} onDone={close} />
          </TabsContent>
          <TabsContent value="members" className="flex min-h-0 flex-1 flex-col">
            <SheetBody scroll className="p-0">
              {ready.value.members === undefined ? (
                <SheetLoading />
              ) : ready.value.members.ok ? (
                <TeamMembersGrid
                  teamId={ready.id}
                  canEdit={canEdit}
                  rows={ready.value.members.value.rows}
                  total={ready.value.members.value.total}
                  page={ready.value.members.value.page}
                  pageSize={ready.value.members.value.pageSize}
                  pending={pending}
                  onPageChange={setPanelPage}
                />
              ) : (
                <SheetError message={ready.value.members.message} />
              )}
            </SheetBody>
          </TabsContent>
        </Tabs>
      )}
    </EntitySheet>
  );
}

function TeamForm({
  team,
  readOnly,
  onDone,
}: {
  readonly team: TeamDetail | undefined;
  readonly readOnly: boolean;
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
          </fieldset>
        </SheetBody>
        {!readOnly && (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {team === undefined ? 'Crear equipo' : 'Guardar cambios'}
            </Button>
          </SheetFooter>
        )}
      </form>
    </Form>
  );
}
