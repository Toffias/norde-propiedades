'use client';

import {
  CreatePropertyInputSchema,
  CURRENCIES,
  OPERATIONS,
  PROPERTY_TYPES,
  type CreatePropertyInput,
  type CreatePropertyValues,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { contractResolver } from '../../../lib/form';
import { EntitySheet, type PanelNavigation } from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { createPropertyAction } from '../actions';
import { CURRENCY_LABELS, OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../labels';

type PropertyValues = CreatePropertyInput;

const INITIAL_VALUES: PropertyValues = {
  propertyType: 'apartment',
  operation: 'sale',
  currency: 'USD',
  price: '',
  street: '',
  streetNumber: '',
  floor: '',
  unit: '',
  neighborhood: '',
  city: '',
  province: '',
  publishAddress: '',
  portalTitle: '',
  latitude: '',
  longitude: '',
};

function Section({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Alta corta de una propiedad en el panel lateral del buscador (`?panel=new`): tipo, operación,
 * dirección y ubicación. Queda como borrador; el resto se completa en la ficha (#6), que por su
 * tamaño va a ser una pantalla propia.
 */
export function PropertySheet({ navigation }: { readonly navigation: PanelNavigation }) {
  const { panel, close } = navigation;
  return (
    <EntitySheet
      open={panel?.kind === 'new'}
      onClose={close}
      width="wide"
      title="Nueva propiedad"
      description="Lo indispensable para tenerla en la cartera. El resto se completa en la ficha."
    >
      {panel?.kind === 'new' && <NewPropertyForm onDone={close} />}
    </EntitySheet>
  );
}

function NewPropertyForm({ onDone }: { readonly onDone: () => void }) {
  const [error, setError] = useState<string | undefined>();
  const form = useForm<PropertyValues, unknown, CreatePropertyValues>({
    resolver: contractResolver(CreatePropertyInputSchema),
    defaultValues: INITIAL_VALUES,
  });

  async function submit(values: CreatePropertyValues) {
    setError(undefined);
    try {
      const result = await createPropertyAction(values);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Propiedad ${result.code ?? ''} creada como borrador`);
      onDone();
    } catch {
      setError(UNEXPECTED_ERROR_MESSAGE);
    }
  }

  const pending = form.formState.isSubmitting;

  function textField(
    name: FieldPath<PropertyValues>,
    label: string,
    options: {
      readonly description?: string;
      readonly optional?: boolean;
      readonly className?: string;
      readonly inputMode?: 'decimal';
    } = {},
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className={options.className}>
            <FormLabel>
              {label}
              {options.optional === true && ' (opcional)'}
            </FormLabel>
            <FormControl>
              <Input
                autoComplete="off"
                {...(options.inputMode ? { inputMode: options.inputMode } : {})}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                onChange={field.onChange}
                value={typeof field.value === 'string' ? field.value : ''}
              />
            </FormControl>
            {options.description !== undefined && (
              <FormDescription>{options.description}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  function selectField<T extends string>(
    name: 'propertyType' | 'operation' | 'currency',
    label: string,
    values: readonly T[],
    labels: Readonly<Record<T, string>>,
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {values.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels[value]}
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

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-5">
          <FormAlert message={error} />

          <Section title="Propiedad" description="El código de referencia se asigna al guardar.">
            <div className="grid gap-4 sm:grid-cols-2 ">
              {selectField('propertyType', 'Tipo', PROPERTY_TYPES, PROPERTY_TYPE_LABELS)}
              {selectField('operation', 'Operación', OPERATIONS, OPERATION_LABELS)}
              {selectField('currency', 'Moneda', CURRENCIES, CURRENCY_LABELS)}
              {textField('price', 'Precio', {
                optional: true,
                inputMode: 'decimal',
                description: 'Sin puntos de miles. Lo podés cargar después.',
              })}
            </div>
          </Section>

          <Section
            title="Dirección"
            description="La calle, la altura, el piso y la unidad son privados: no se publican."
          >
            <div className="grid gap-4 sm:grid-cols-2 ">
              {textField('street', 'Calle', { className: 'sm:col-span-2' })}
              {textField('streetNumber', 'Altura', { optional: true })}
              <div className="grid grid-cols-2 gap-4">
                {textField('floor', 'Piso', { optional: true })}
                {textField('unit', 'Unidad', { optional: true })}
              </div>
              {textField('neighborhood', 'Barrio')}
              {textField('city', 'Localidad')}
              {textField('province', 'Provincia')}
            </div>
          </Section>

          <Section
            title="Para publicar"
            description="Lo que ven la web y los portales. Si lo dejás vacío, se arma solo."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('publishAddress', 'Dirección para publicar', {
                optional: true,
                description:
                  'Vacío: la calle con la altura redondeada, por ejemplo "Gurruchaga al 1800".',
              })}
              {textField('portalTitle', 'Título para portales', {
                optional: true,
                description:
                  'Vacío: tipo, operación y barrio, por ejemplo "Departamento en venta en Palermo".',
              })}
              {textField('latitude', 'Latitud', {
                optional: true,
                inputMode: 'decimal',
                description: 'Para el mapa. Por ejemplo -34.5861.',
              })}
              {textField('longitude', 'Longitud', {
                optional: true,
                inputMode: 'decimal',
                description: 'Por ejemplo -58.4321.',
              })}
            </div>
          </Section>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Crear propiedad
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
