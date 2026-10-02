'use client';

import {
  CLIENT_KIND_LABELS,
  CLIENT_KIND_VALUES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_VALUES,
  ClientContactInputSchema,
  CONTACT_CHANNEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_VALUES,
  EMAIL_KIND_LABELS,
  PHONE_KIND_LABELS,
  UpdateClientDetailsInputSchema,
  type ClientContactInput,
  type ClientDetail,
  type UpdateClientDetailsInput,
} from '@norde/core/clients/contracts';
import { SectionCard } from '@norde/ui/components/section-card';
import { Form } from '@norde/ui/components/form';
import { LockIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { EMPTY_VALUE, formatDateOnly, formatDateTime } from '../../../lib/format';
import { contractResolver } from '../../../lib/form';
import {
  ChecklistField,
  SelectField,
  submitWith,
  TextField,
} from '../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import { updateClientDetailsAction } from '../actions';
import { formatPhone } from '../client-format';
import { ContactFields } from './contact-fields';

const or = (value: string | undefined) => value ?? EMPTY_VALUE;

// ---------- Teléfonos y emails ----------

function ContactView({ detail }: { readonly detail: ClientDetail }) {
  if (detail.phones.length === 0 && detail.emails.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de contacto.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {detail.contactMasked && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon className="h-3 w-3" aria-hidden />
          Datos de propietario: se ven con el permiso «Ver datos de propietarios».
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {detail.phones.map((phone, index) => (
          <li key={`${phone.kind}-${String(index)}`} className="flex flex-col text-sm">
            <span className="text-xs text-muted-foreground">
              {PHONE_KIND_LABELS[phone.kind]}
              {index === 0 ? ' · principal' : ''}
            </span>
            <span className="font-medium tabular-nums">
              {detail.contactMasked ? phone.number : formatPhone(phone.number)}
              {phone.contactHours !== undefined && (
                <span className="font-normal text-muted-foreground"> · {phone.contactHours}</span>
              )}
            </span>
          </li>
        ))}
        {detail.emails.map((email, index) => (
          <li key={`${email.kind}-${String(index)}`} className="flex flex-col text-sm">
            <span className="text-xs text-muted-foreground">
              Email {EMAIL_KIND_LABELS[email.kind].toLowerCase()}
              {index === 0 ? ' · principal' : ''}
            </span>
            <span className="font-medium break-all">{email.address}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactForm({
  detail,
  controls,
}: {
  readonly detail: ClientDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<ClientContactInput>({
    resolver: contractResolver(ClientContactInputSchema),
    defaultValues: {
      phones: detail.phones.map((phone) => ({
        kind: phone.kind,
        number: phone.number,
        contactHours: phone.contactHours ?? '',
      })),
      emails: detail.emails.map((email) => ({ kind: email.kind, address: email.address })),
    },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={submitWith(form, (contact) => {
          controls.save(
            () => updateClientDetailsAction({ clientId: detail.id, contact }),
            'Datos de contacto guardados.',
          );
        })}
      >
        <ContactFields />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Datos ----------

type DetailsValues = Pick<UpdateClientDetailsInput, 'clientId' | 'name' | 'kind' | 'profile'>;
const DetailsSchema = UpdateClientDetailsInputSchema.pick({
  clientId: true,
  name: true,
  kind: true,
  profile: true,
});

function DetailsForm({
  detail,
  controls,
}: {
  readonly detail: ClientDetail;
  readonly controls: InlineFormControls;
}) {
  const p = detail.profile;
  const form = useForm<DetailsValues>({
    resolver: contractResolver(DetailsSchema),
    defaultValues: {
      clientId: detail.id,
      name: detail.name ?? '',
      kind: detail.kind,
      profile: {
        companyName: p.companyName ?? '',
        jobTitle: p.jobTitle ?? '',
        website: p.website ?? '',
        birthDate: p.birthDate ?? '',
        address: p.address ?? '',
        country: p.country ?? '',
        language: p.language ?? '',
        documentType: DOCUMENT_TYPE_VALUES.find((value) => value === p.documentType) ?? '',
        documentNumber: p.documentNumber ?? '',
      },
    },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={submitWith(form, (values) => {
          // Sin "Renombrar contactos", el nombre no viaja: el caso de uso lo rechazaría.
          const { name, ...rest } = values;
          controls.save(() =>
            updateClientDetailsAction(detail.can.rename && name !== undefined ? values : rest),
          );
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label="Nombre"
            autoComplete="off"
            disabled={!detail.can.rename}
            {...(detail.can.rename ? {} : { description: 'Cambiarlo pide «Renombrar contactos».' })}
          />
          <SelectField
            control={form.control}
            name="kind"
            label="Tipo de registro"
            options={CLIENT_KIND_VALUES}
            labels={CLIENT_KIND_LABELS}
          />
          <TextField control={form.control} name="profile.companyName" label="Empresa" />
          <TextField control={form.control} name="profile.jobTitle" label="Cargo" />
          <TextField control={form.control} name="profile.website" label="Web" type="url" />
          <TextField
            control={form.control}
            name="profile.birthDate"
            label="Fecha de nacimiento"
            type="date"
          />
          <div className="sm:col-span-2">
            <TextField control={form.control} name="profile.address" label="Dirección" />
          </div>
          <TextField control={form.control} name="profile.country" label="País" />
          <TextField control={form.control} name="profile.language" label="Idioma" />
          <SelectField
            control={form.control}
            name="profile.documentType"
            label="Tipo de documento"
            options={DOCUMENT_TYPE_VALUES}
            labels={DOCUMENT_TYPE_LABELS}
            empty="Sin documento"
          />
          <TextField
            control={form.control}
            name="profile.documentNumber"
            label="Número de documento"
            autoComplete="off"
            disabled={detail.contactMasked}
          />
        </div>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

function documentLabel(detail: ClientDetail): string {
  const type = DOCUMENT_TYPE_VALUES.find((value) => value === detail.profile.documentType);
  const number = detail.profile.documentNumber;
  if (number === undefined) return EMPTY_VALUE;
  return type === undefined ? number : `${DOCUMENT_TYPE_LABELS[type]} ${number}`;
}

// ---------- Tipos de cliente ----------

type TypesValues = Pick<UpdateClientDetailsInput, 'clientId' | 'clientTypes'>;
const TypesSchema = UpdateClientDetailsInputSchema.pick({ clientId: true, clientTypes: true });

function TypesForm({
  detail,
  controls,
}: {
  readonly detail: ClientDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<TypesValues>({
    resolver: contractResolver(TypesSchema),
    defaultValues: { clientId: detail.id, clientTypes: [...detail.clientTypes] },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={submitWith(form, (values) => {
          // Sin ninguna casilla marcada, la lista viaja vacía (no "sin cambios").
          controls.save(
            () => updateClientDetailsAction({ ...values, clientTypes: values.clientTypes ?? [] }),
            'Tipos de cliente guardados.',
          );
        })}
      >
        <ChecklistField
          control={form.control}
          name="clientTypes"
          label="Qué es para Norde"
          options={CLIENT_TYPE_VALUES.map((value) => ({
            value,
            label: CLIENT_TYPE_LABELS[value],
          }))}
        />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

/** Las secciones de la ficha: datos de contacto, datos, tipos de cliente y canales. */
export function ClientDetailSections({ detail }: { readonly detail: ClientDetail }) {
  const p = detail.profile;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InlineSection
        title="Teléfonos y emails"
        // Los datos de un propietario enmascarado no se editan a ciegas.
        canEdit={detail.can.edit && !detail.contactMasked}
        view={<ContactView detail={detail} />}
        form={(controls) => <ContactForm detail={detail} controls={controls} />}
      />
      <InlineSection
        title="Tipos de cliente"
        canEdit={detail.can.edit}
        view={
          detail.clientTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tipos de cliente.</p>
          ) : (
            <p className="text-sm font-medium">
              {detail.clientTypes.map((type) => CLIENT_TYPE_LABELS[type]).join(', ')}
            </p>
          )
        }
        form={(controls) => <TypesForm detail={detail} controls={controls} />}
      />
      <InlineSection
        title="Datos"
        className="lg:col-span-2"
        canEdit={detail.can.edit}
        view={
          <Facts
            columns={3}
            items={[
              { label: 'Tipo de registro', value: CLIENT_KIND_LABELS[detail.kind] },
              { label: 'Empresa', value: or(p.companyName) },
              { label: 'Cargo', value: or(p.jobTitle) },
              { label: 'Web', value: or(p.website) },
              { label: 'Fecha de nacimiento', value: formatDateOnly(p.birthDate) },
              { label: 'Dirección', value: or(p.address) },
              { label: 'País', value: or(p.country) },
              { label: 'Idioma', value: or(p.language) },
              { label: 'Documento', value: documentLabel(detail) },
            ]}
          />
        }
        form={(controls) => <DetailsForm detail={detail} controls={controls} />}
      />
      <SectionCard title="Canales de contacto" className="lg:col-span-2">
        {detail.channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Lo cargaron desde el panel: todavía no se comunicó por ningún canal.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.channels.map((channel, index) => (
              <li
                key={`${channel.channel}-${String(index)}`}
                className="flex flex-col text-sm sm:flex-row sm:justify-between sm:gap-4"
              >
                <span className="font-medium">
                  {CONTACT_CHANNEL_LABELS[channel.channel] ?? channel.channel}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  Primer contacto {formatDateTime(channel.firstContactAt)} · último{' '}
                  {formatDateTime(channel.lastContactAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
