'use client';

import {
  ChangePropertyCodeInputSchema,
  UpdatePropertyInternalInfoInputSchema,
  type ChangePropertyCodeInput,
  type PanelPropertyDetail,
  type PanelUserRef,
  type UpdatePropertyInternalInfoInput,
} from '@norde/core/properties/contracts';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Label } from '@norde/ui/components/label';
import { PagedMultiSelect, type LoadComboboxPage } from '@norde/ui/components/paged-combobox';
import { Button } from '@norde/ui/components/button';
import { LockIcon, XIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Fragment, useState, type SyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';

import { EMPTY_VALUE, formatDateTime } from '../../../../lib/format';
import { contractResolver } from '../../../../lib/form';
import { loadClientOptions } from '../../../clients/actions';
import { loadUserOptions } from '../../../identity/actions';
import { EntityPicker } from '../../../identity/components/entity-picker';
import {
  addPropertyOwnerAction,
  changePropertyCodeAction,
  changePropertyProducerAction,
  removePropertyOwnerAction,
  updatePropertyInternalInfoAction,
} from '../../detail-actions';
import { TextareaField, TextField, submitWith } from '../../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../../shared/components/inline-section';

/** Contactos activos que el actor ve, por nombre, teléfono o email. */
const loadOwners: LoadComboboxPage = (search, page) => loadClientOptions(search, page);

function name(user: PanelUserRef | undefined): string {
  if (user === undefined) return EMPTY_VALUE;
  // Un job (la conversión de una tasación, una importación): como en el historial.
  if (user.id.startsWith('system:')) return 'El sistema';
  return user.name ?? 'Usuario inactivo';
}

function text(value: string | undefined): string {
  return value === undefined || value === '' ? EMPTY_VALUE : value;
}

/** Información interna: no sale en la web ni en los portales. */
export function InternalSection({
  detail,
  canEdit,
  canChangeProducer,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
  readonly canChangeProducer: boolean;
}) {
  const { internal } = detail;
  return (
    <InlineSection
      title="Información interna"
      icon={LockIcon}
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-4">
          <Facts
            items={[
              { label: 'Código de referencia', value: detail.code },
              { label: 'Captador (productor)', value: name(detail.producer) },
              {
                label: 'Tasadores',
                value:
                  internal.appraisers.length === 0
                    ? EMPTY_VALUE
                    : internal.appraisers.map((user) => name(user)).join(', '),
              },
              { label: 'Mantenimiento', value: name(internal.maintenance) },
              { label: 'Ubicación de las llaves', value: text(internal.keysLocation) },
              { label: 'Propietarios', value: <OwnerLinks owners={detail.owners} /> },
              {
                label: 'Creada por',
                value: `${name(detail.createdBy)} · ${formatDateTime(detail.createdAt)}`,
              },
            ]}
          />
          <Facts
            items={[
              { label: 'Información legal', value: text(internal.legalInfo) },
              { label: 'Comentarios internos', value: text(internal.internalComments) },
            ]}
          />
        </div>
      }
      form={(controls) => (
        <InternalForms detail={detail} controls={controls} canChangeProducer={canChangeProducer} />
      )}
    />
  );
}

function InternalForms({
  detail,
  controls,
  canChangeProducer,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
  readonly canChangeProducer: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CodeForm detail={detail} controls={controls} />
      {canChangeProducer && <ProducerForm detail={detail} controls={controls} />}
      {canChangeProducer && <OwnersForm detail={detail} controls={controls} />}
      <InternalInfoForm detail={detail} controls={controls} />
    </div>
  );
}

function CodeForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<ChangePropertyCodeInput>({
    resolver: contractResolver(ChangePropertyCodeInputSchema),
    defaultValues: { propertyId: detail.id, code: detail.code },
  });
  return (
    <Form {...form}>
      <form
        className="flex items-end gap-2"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => changePropertyCodeAction(values), 'Código actualizado.');
        })}
      >
        <div className="flex-1">
          <TextField
            control={form.control}
            name="code"
            label="Código de referencia"
            autoCapitalize="characters"
          />
        </div>
        <button
          type="submit"
          className="mb-0.5 h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          disabled={controls.pending}
        >
          Cambiar código
        </button>
      </form>
    </Form>
  );
}

function ProducerForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const [userId, setUserId] = useState<string | undefined>(detail.producer?.id);
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (userId === undefined) return;
    controls.save(
      () => changePropertyProducerAction({ propertyId: detail.id, userId }),
      'Captador actualizado.',
    );
  }
  return (
    <form className="flex items-end gap-2" onSubmit={submit}>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label>Captador (productor)</Label>
        <EntityPicker
          value={userId}
          initial={
            detail.producer === undefined
              ? undefined
              : { value: detail.producer.id, label: name(detail.producer) }
          }
          onChange={setUserId}
          loadPage={loadUserOptions}
          placeholder="Elegí el captador"
          searchPlaceholder="Buscar usuario"
        />
      </div>
      <button
        type="submit"
        className="mb-0.5 h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        disabled={controls.pending || userId === undefined || userId === detail.producer?.id}
      >
        Cambiar captador
      </button>
    </form>
  );
}

/** Los propietarios, con el enlace a su ficha de contacto. */
function OwnerLinks({ owners }: { readonly owners: PanelPropertyDetail['owners'] }) {
  if (owners.length === 0) return EMPTY_VALUE;
  return owners.map((owner, index) => (
    <Fragment key={owner.id}>
      {index > 0 && ', '}
      <Link
        // La ficha del contacto: typedRoutes no verifica un segmento armado.
        href={`/contactos/${owner.id}` as Route}
        className="hover:underline"
      >
        {owner.name}
      </Link>
    </Fragment>
  ));
}

/** Suma o quita propietarios, uno por vez: cada cambio queda en el historial. */
function OwnersForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const [clientId, setClientId] = useState<string | undefined>();
  const owned = new Set(detail.owners.map((owner) => owner.id));
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (clientId === undefined) return;
    controls.save(
      () => addPropertyOwnerAction({ propertyId: detail.id, clientId }),
      'Propietario agregado.',
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Propietarios (privado)</Label>
      {detail.owners.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {detail.owners.map((owner) => (
            <li
              key={owner.id}
              className="flex items-center gap-1 rounded-md border border-input py-0.5 pr-0.5 pl-2 text-sm"
            >
              {owner.name}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label={`Quitar a ${owner.name} como propietario`}
                disabled={controls.pending}
                onClick={() => {
                  controls.save(
                    () => removePropertyOwnerAction({ propertyId: detail.id, clientId: owner.id }),
                    'Propietario quitado.',
                  );
                }}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex items-end gap-2" onSubmit={submit}>
        <div className="min-w-0 flex-1">
          <EntityPicker
            value={clientId}
            initial={undefined}
            onChange={setClientId}
            loadPage={loadOwners}
            placeholder="Buscar contacto"
            searchPlaceholder="Nombre, teléfono o email"
          />
        </div>
        <button
          type="submit"
          className="mb-0.5 h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          disabled={controls.pending || clientId === undefined || owned.has(clientId)}
        >
          Agregar propietario
        </button>
      </form>
    </div>
  );
}

function InternalInfoForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const { internal } = detail;
  const form = useForm<UpdatePropertyInternalInfoInput>({
    resolver: contractResolver(UpdatePropertyInternalInfoInputSchema),
    defaultValues: {
      propertyId: detail.id,
      maintenanceUserId: internal.maintenance?.id,
      appraiserUserIds: internal.appraisers.map((user) => user.id),
      keysLocation: internal.keysLocation ?? '',
      legalInfo: internal.legalInfo ?? '',
      internalComments: internal.internalComments ?? '',
    },
  });
  const [appraisers, setAppraisers] = useState(
    internal.appraisers.map((user) => ({ value: user.id, label: name(user) })),
  );

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(
            () =>
              updatePropertyInternalInfoAction({
                ...values,
                appraiserUserIds: appraisers.map((user) => user.value),
              }),
            'Información interna guardada.',
          );
        })}
      >
        <div className="flex flex-col gap-1.5">
          <Label>Tasadores</Label>
          <PagedMultiSelect
            value={appraisers}
            onChange={(next) => {
              setAppraisers([...next]);
            }}
            loadPage={loadUserOptions}
            placeholder="Elegí los tasadores"
            searchPlaceholder="Buscar usuario"
          />
        </div>
        <FormField
          control={form.control}
          name="maintenanceUserId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Usuario de mantenimiento</FormLabel>
              <FormControl>
                <EntityPicker
                  value={field.value}
                  initial={
                    internal.maintenance === undefined
                      ? undefined
                      : { value: internal.maintenance.id, label: name(internal.maintenance) }
                  }
                  onChange={field.onChange}
                  loadPage={loadUserOptions}
                  placeholder="Sin usuario de mantenimiento"
                  searchPlaceholder="Buscar usuario"
                  clearLabel="Quitar el usuario de mantenimiento"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextField control={form.control} name="keysLocation" label="Ubicación de las llaves" />
        <TextareaField control={form.control} name="legalInfo" label="Información legal" rows={3} />
        <TextareaField
          control={form.control}
          name="internalComments"
          label="Comentarios internos"
          rows={3}
        />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}
