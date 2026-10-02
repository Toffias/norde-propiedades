'use client';

import {
  CLIENT_KIND_LABELS,
  CLIENT_KIND_VALUES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_VALUES,
  CreateClientInputSchema,
  type ClientDuplicateRef,
  type ClientDuplicates,
  type CreateClientInput,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@norde/ui/components/form';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { contractResolver } from '../../../lib/form';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { EntitySheet, type PanelNavigation } from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { ChecklistField, SelectField, TextField } from '../../shared/components/form-fields';
import { checkClientDuplicatesAction, createClientAction, restoreClientAction } from '../actions';
import { clientName, userName } from '../client-format';
import { ContactFields } from './contact-fields';

const DEFAULTS: CreateClientInput = {
  kind: 'person',
  name: '',
  phones: [{ kind: 'mobile', number: '', contactHours: '' }],
  emails: [],
  clientTypes: [],
  profile: { companyName: '' },
};

function contactHref(id: string): Route {
  // La ficha del contacto: typedRoutes no verifica un segmento dinámico armado.
  return `/contactos/${id}` as Route;
}

/** El contacto que ya existe con ese teléfono o email: se abre o se restaura, no se duplica. */
function ExistingClient({
  client,
  onRestored,
}: {
  readonly client: ClientDuplicateRef;
  readonly onRestored: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const who = `${clientName(client.name)}${client.agent ? `, a cargo de ${userName(client.agent)}` : ''}`;

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-foreground dark:border-warning-500/50 dark:bg-warning-500/10"
    >
      <p className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {client.trashed
            ? `Ya hay un contacto con ese teléfono o email en la papelera: ${who}.`
            : `Ya hay un contacto con ese teléfono o email: ${who}.`}
        </span>
      </p>
      <FormAlert message={error} />
      {client.canOpen ? (
        client.trashed ? (
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const message = await runAction(() => restoreClientAction({ clientId: client.id }));
                if (message !== undefined) {
                  setError(message);
                  return;
                }
                toast.success('Contacto restaurado');
                onRestored();
              });
            }}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Restaurarlo
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="self-start">
            <Link href={contactHref(client.id)}>Abrir su ficha</Link>
          </Button>
        )
      ) : (
        <p className="text-muted-foreground">
          Es de otro agente: pedile que te lo asigne o avisale a tu gerente.
        </p>
      )}
    </div>
  );
}

/** Mismo nombre, otros datos: puede ser la misma persona. Se avisa y se puede crear igual. */
function PossibleDuplicates({ clients }: { readonly clients: readonly ClientDuplicateRef[] }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm"
    >
      <p className="font-medium">Posible duplicado: hay contactos con el mismo nombre.</p>
      <ul className="flex flex-col gap-1">
        {clients.map((client) => (
          <li key={client.id}>
            {client.canOpen ? (
              <Link
                href={contactHref(client.id)}
                className="text-primary-700 hover:underline dark:text-primary-400"
              >
                {clientName(client.name)}
              </Link>
            ) : (
              clientName(client.name)
            )}
            {client.agent && (
              <span className="text-muted-foreground"> · {userName(client.agent)}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Si es otra persona, tocá «Crear igual». Si es la misma, abrí su ficha y sumale los datos.
      </p>
    </div>
  );
}

/**
 * Alta de un contacto en el panel lateral. Antes de crear busca duplicados por teléfono y email
 * (también en la papelera) y por nombre.
 */
export function ClientCreateSheet({
  navigation,
  canAssignAgent,
}: {
  readonly navigation: PanelNavigation;
  /** `clients:reassign` y `users:read`: elegir otro agente que no sea el actor. */
  readonly canAssignAgent: boolean;
}) {
  const { panel, close } = navigation;
  return (
    <EntitySheet
      open={panel?.kind === 'new'}
      onClose={close}
      title="Nuevo contacto"
      description="Con nombre y al menos un teléfono o un email. Los demás datos se completan en la ficha."
    >
      {panel?.kind === 'new' && <CreateForm canAssignAgent={canAssignAgent} onCancel={close} />}
    </EntitySheet>
  );
}

function CreateForm({
  canAssignAgent,
  onCancel,
}: {
  readonly canAssignAgent: boolean;
  readonly onCancel: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [duplicates, setDuplicates] = useState<ClientDuplicates | undefined>();
  const form = useForm<CreateClientInput>({
    resolver: contractResolver(CreateClientInputSchema),
    defaultValues: DEFAULTS,
  });

  // Si cambian los datos de contacto o el nombre, el aviso de duplicados ya no vale.
  function resetCheck() {
    if (duplicates !== undefined) setDuplicates(undefined);
  }

  async function submit(values: CreateClientInput) {
    setError(undefined);
    try {
      // "Crear igual": ya se mostraron los posibles duplicados y no hay uno exacto.
      if (duplicates === undefined || duplicates.existing !== undefined) {
        const check = await checkClientDuplicatesAction({
          name: values.name,
          phones: (values.phones ?? []).map((phone) => phone.number),
          emails: (values.emails ?? []).map((email) => email.address),
        });
        if (!check.ok) {
          setError(check.message);
          return;
        }
        if (check.existing !== undefined || check.possible.length > 0) {
          setDuplicates(check);
          return;
        }
      }
      const created = await createClientAction(values);
      if (!created.ok) {
        setError(created.message);
        return;
      }
      toast.success('Contacto creado');
      if (created.clientId !== undefined) router.push(contactHref(created.clientId));
    } catch {
      setError(UNEXPECTED_ERROR_MESSAGE);
    }
  }

  const pending = form.formState.isSubmitting;
  const blocked = duplicates?.existing !== undefined;

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onChange={resetCheck}
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll>
          <FormAlert message={error} />
          {duplicates?.existing !== undefined && (
            <ExistingClient
              client={duplicates.existing}
              onRestored={() => {
                if (duplicates.existing) router.push(contactHref(duplicates.existing.id));
              }}
            />
          )}
          {duplicates?.existing === undefined && duplicates !== undefined && (
            <PossibleDuplicates clients={duplicates.possible} />
          )}
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <TextField control={form.control} name="name" label="Nombre" autoComplete="off" />
              <SelectField
                control={form.control}
                name="kind"
                label="Tipo de registro"
                options={CLIENT_KIND_VALUES}
                labels={CLIENT_KIND_LABELS}
              />
            </div>
            <ContactFields />
            <TextField
              control={form.control}
              name="profile.companyName"
              label="Empresa (opcional)"
              autoComplete="off"
            />
            <ChecklistField
              control={form.control}
              name="clientTypes"
              label="Tipos de cliente"
              options={CLIENT_TYPE_VALUES.map((value) => ({
                value,
                label: CLIENT_TYPE_LABELS[value],
              }))}
            />
            {canAssignAgent && (
              <FormField
                control={form.control}
                name="agentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agente (opcional)</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        initial={undefined}
                        onChange={field.onChange}
                        loadPage={loadUserOptions}
                        placeholder="Yo"
                        searchPlaceholder="Buscar agente"
                        clearLabel="Quedármelo yo"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || blocked}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {duplicates !== undefined && !blocked ? 'Crear igual' : 'Crear contacto'}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
