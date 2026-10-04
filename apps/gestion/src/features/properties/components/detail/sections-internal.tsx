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
import { PagedMultiSelect } from '@norde/ui/components/paged-combobox';
import { useState, type SyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';

import { EMPTY_VALUE, formatDateTime } from '../../../../lib/format';
import { contractResolver } from '../../../../lib/form';
import { loadUserOptions } from '../../../identity/actions';
import { EntityPicker } from '../../../identity/components/entity-picker';
import {
  changePropertyCodeAction,
  changePropertyProducerAction,
  updatePropertyInternalInfoAction,
} from '../../detail-actions';
import { TextareaField, TextField, submitWith } from '../../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../../shared/components/inline-section';

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
              {
                label: 'Propietarios',
                value:
                  detail.owners.length === 0
                    ? 'Se cargan cuando estén los contactos'
                    : detail.owners.map((owner) => owner.name).join(', '),
              },
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
