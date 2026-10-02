'use client';

import { Checkbox } from '@norde/ui/components/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { Switch } from '@norde/ui/components/switch';
import { Textarea } from '@norde/ui/components/textarea';
import type { ComponentProps, SyntheticEvent } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

// Campos de los formularios del panel, ligados a react-hook-form. Los valores vacíos viajan como
// `''` y `contractResolver` los convierte en `undefined` antes de validar con el contract.

interface FieldProps<T extends FieldValues> {
  readonly control: Control<T>;
  readonly name: FieldPath<T>;
  readonly label: string;
  readonly description?: string;
}

/** Un texto o un número escrito (los montos y las medidas se escriben como texto). */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...input
}: FieldProps<T> & Omit<ComponentProps<typeof Input>, 'name'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...input}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                typeof field.value === 'string' || typeof field.value === 'number'
                  ? field.value
                  : ''
              }
              onChange={(event) => {
                field.onChange(event.target.value);
              }}
            />
          </FormControl>
          {description !== undefined && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Un número opcional: vacío es "sin dato" (`undefined`), si no el número. */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  step = 'any',
}: FieldProps<T> & { readonly step?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={step}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === 'number' ? field.value : ''}
              onChange={(event) => {
                const raw = event.target.value;
                field.onChange(raw === '' ? undefined : Number(raw));
              }}
            />
          </FormControl>
          {description !== undefined && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  rows = 4,
}: FieldProps<T> & { readonly rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              rows={rows}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(event) => {
                field.onChange(event.target.value);
              }}
            />
          </FormControl>
          {description !== undefined && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Lista de opciones; con `empty`, se puede dejar sin valor. */
export function SelectField<T extends FieldValues, V extends string>({
  control,
  name,
  label,
  options,
  labels,
  empty,
}: FieldProps<T> & {
  readonly options: readonly V[];
  readonly labels: Readonly<Record<V, string>>;
  readonly empty?: string;
}) {
  const NONE = '__none__';
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={typeof field.value === 'string' && field.value !== '' ? field.value : NONE}
            onValueChange={(value) => {
              field.onChange(value === NONE ? undefined : value);
            }}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {empty !== undefined && <SelectItem value={NONE}>{empty}</SelectItem>}
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: FieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <FormLabel>{label}</FormLabel>
            {description !== undefined && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch
              checked={field.value === true}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/** Casillas de una lista de IDs (servicios, ambientes, adicionales). */
export function ChecklistField<T extends FieldValues>({
  control,
  name,
  label,
  options,
}: FieldProps<T> & {
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = new Set<string>(Array.isArray(field.value) ? field.value : []);
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(option.value)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selected);
                      if (checked === true) next.add(option.value);
                      else next.delete(option.value);
                      field.onChange([...next]);
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/**
 * `onSubmit` de un formulario de react-hook-form: valida con el contract y, si pasa, llama
 * `onValid`. La promesa de `handleSubmit` no se espera (el resultado lo maneja `onValid`).
 */
export function submitWith<TValid>(
  form: {
    readonly handleSubmit: (
      onValid: (values: TValid) => void,
    ) => (event?: SyntheticEvent) => Promise<void>;
  },
  onValid: (values: TValid) => void,
) {
  return (event: SyntheticEvent) => {
    void form.handleSubmit(onValid)(event);
  };
}
