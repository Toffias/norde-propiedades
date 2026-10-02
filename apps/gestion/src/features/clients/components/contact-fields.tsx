'use client';

import {
  EMAIL_KIND_LABELS,
  EMAIL_KIND_VALUES,
  MAX_CLIENT_EMAILS,
  MAX_CLIENT_PHONES,
  PHONE_KIND_LABELS,
  PHONE_KIND_VALUES,
  type ClientEmailInput,
  type ClientPhoneInput,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { SelectField, TextField } from '../../shared/components/form-fields';

/** Lo que tienen en común los formularios con teléfonos y emails (alta y ficha). */
export interface ContactValues {
  phones: ClientPhoneInput[];
  emails: ClientEmailInput[];
}

/**
 * Teléfonos (con tipo y horario de contacto) y emails, en el orden en que se cargan: el primero de
 * cada lista es el principal. Va dentro de un `<Form>` cuyos valores tienen `phones` y `emails`.
 */
export function ContactFields() {
  const form = useFormContext<ContactValues>();
  const phones = useFieldArray({ control: form.control, name: 'phones' });
  const emails = useFieldArray({ control: form.control, name: 'emails' });

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Teléfonos</legend>
        {phones.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[140px_1fr_auto]"
          >
            <SelectField
              control={form.control}
              name={`phones.${index}.kind`}
              label="Tipo"
              options={PHONE_KIND_VALUES}
              labels={PHONE_KIND_LABELS}
            />
            <TextField
              control={form.control}
              name={`phones.${index}.number`}
              label={index === 0 ? 'Número (principal)' : 'Número'}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="11 6689-9124"
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar el teléfono"
                onClick={() => {
                  phones.remove(index);
                }}
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
            <div className="sm:col-span-3">
              <TextField
                control={form.control}
                name={`phones.${index}.contactHours`}
                label="Horario de contacto (opcional)"
                autoComplete="off"
                placeholder="De 9 a 13"
              />
            </div>
          </div>
        ))}
        {phones.fields.length < MAX_CLIENT_PHONES && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              phones.append({
                kind: phones.fields.length === 0 ? 'mobile' : 'other',
                number: '',
                contactHours: '',
              });
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Agregar teléfono
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Emails</legend>
        {emails.fields.map((field, index) => (
          <div key={field.id} className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
            <SelectField
              control={form.control}
              name={`emails.${index}.kind`}
              label="Tipo"
              options={EMAIL_KIND_VALUES}
              labels={EMAIL_KIND_LABELS}
            />
            <TextField
              control={form.control}
              name={`emails.${index}.address`}
              label={index === 0 ? 'Email (principal)' : 'Email'}
              type="email"
              autoComplete="off"
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar el email"
                onClick={() => {
                  emails.remove(index);
                }}
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {emails.fields.length < MAX_CLIENT_EMAILS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              emails.append({ kind: emails.fields.length === 0 ? 'main' : 'other', address: '' });
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Agregar email
          </Button>
        )}
      </fieldset>
    </div>
  );
}
