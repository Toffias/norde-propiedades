'use client';

import {
  CreateDevelopmentInputSchema,
  DEVELOPMENT_TYPES,
  type CreateDevelopmentInput,
  type GeocodingOutcome,
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
import type { ComboboxOption, LoadComboboxPage } from '@norde/ui/components/paged-combobox';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { contractResolver } from '../../../lib/form';
import { loadClientOptions } from '../../clients/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { loadLocationOptions } from '../../properties/actions';
import { EntitySheet, type PanelNavigation } from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { SelectField, TextField } from '../../shared/components/form-fields';
import { createDevelopmentAction } from '../actions';
import { DEVELOPMENT_TYPE_LABELS } from '../labels';

type Values = CreateDevelopmentInput;
type ValidValues = Parameters<typeof createDevelopmentAction>[0];

const INITIAL_VALUES: Values = {
  name: '',
  developmentType: 'building',
  privateAddress: '',
  publishAddress: '',
  portalTitle: '',
  developerName: '',
  commercialContactClientId: undefined,
  locationId: '',
  latitude: '',
  longitude: '',
};

/** Qué se avisa al crear, según cómo quedaron las coordenadas para el mapa. */
export const GEOCODING_NOTICE: Readonly<Record<GeocodingOutcome, string | undefined>> = {
  manual: undefined,
  found: 'Lo ubicamos en el mapa a partir de la dirección.',
  not_found: 'No encontramos la dirección en el mapa: cargá las coordenadas en la ficha.',
  failed: 'No pudimos ubicarlo en el mapa ahora: cargá las coordenadas en la ficha.',
};

/** Contactos de cualquier tipo, para el contacto comercial. */
const loadContacts: LoadComboboxPage = (search, page) => loadClientOptions(search, page);

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

/** Un selector paginado que guarda solo el ID, ligado al formulario. */
export function PickerField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  loadPage,
  placeholder,
  searchPlaceholder,
  initial,
  clearLabel,
}: {
  readonly control: Control<T>;
  readonly name: FieldPath<T>;
  readonly label: string;
  readonly description?: string;
  readonly loadPage: LoadComboboxPage;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly initial?: ComboboxOption | undefined;
  readonly clearLabel?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <EntityPicker
              value={
                typeof field.value === 'string' && field.value !== '' ? field.value : undefined
              }
              initial={initial}
              onChange={field.onChange}
              loadPage={loadPage}
              placeholder={placeholder}
              searchPlaceholder={searchPlaceholder}
              {...(clearLabel === undefined ? {} : { clearLabel })}
            />
          </FormControl>
          {description !== undefined && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Alta de un emprendimiento en el panel lateral del listado (`?panel=new`): nombre, tipo, dirección
 * privada, ubicación, título para portales, desarrollista y contacto comercial. Nace "cargando
 * información"; el resto se completa en la ficha, que se abre al crear.
 */
export function DevelopmentSheet({ navigation }: { readonly navigation: PanelNavigation }) {
  const { panel, close } = navigation;
  return (
    <EntitySheet
      open={panel?.kind === 'new'}
      onClose={close}
      width="wide"
      title="Nuevo emprendimiento"
      description="Lo indispensable para cargarlo. El resto, y las unidades, se completan en la ficha."
    >
      {panel?.kind === 'new' && <NewDevelopmentForm onCancel={close} />}
    </EntitySheet>
  );
}

function NewDevelopmentForm({ onCancel }: { readonly onCancel: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const form = useForm<Values, unknown, ValidValues>({
    resolver: contractResolver(CreateDevelopmentInputSchema),
    defaultValues: INITIAL_VALUES,
  });

  async function submit(values: ValidValues) {
    setError(undefined);
    try {
      const result = await createDevelopmentAction(values);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const notice =
        result.geocoding === undefined ? undefined : GEOCODING_NOTICE[result.geocoding];
      toast.success(`Emprendimiento ${result.code ?? ''} creado`, {
        ...(notice === undefined ? {} : { description: notice }),
      });
      if (result.developmentId !== undefined) {
        // La ficha del emprendimiento nuevo: typedRoutes no verifica un segmento armado.
        router.push(`/emprendimientos/${result.developmentId}` as Route);
      } else {
        onCancel();
      }
    } catch {
      setError(UNEXPECTED_ERROR_MESSAGE);
    }
  }

  const pending = form.formState.isSubmitting;
  const { control } = form;

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-5">
          <FormAlert message={error} />

          <Section
            title="Emprendimiento"
            description="El código de referencia se asigna al guardar."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={control} name="name" label="Nombre público" autoComplete="off" />
              <SelectField
                control={control}
                name="developmentType"
                label="Tipo de desarrollo"
                options={DEVELOPMENT_TYPES}
                labels={DEVELOPMENT_TYPE_LABELS}
              />
            </div>
          </Section>

          <Section
            title="Ubicación"
            description="Las unidades heredan la dirección y la ubicación del emprendimiento."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={control}
                name="privateAddress"
                label="Dirección (privada)"
                description="No se publica. Por ejemplo, Gurruchaga 1834."
                autoComplete="off"
              />
              <PickerField
                control={control}
                name="locationId"
                label="Barrio, localidad o provincia"
                loadPage={loadLocationOptions}
                placeholder="Buscar ubicación"
                searchPlaceholder="Ej. Palermo"
              />
              <TextField
                control={control}
                name="latitude"
                label="Latitud (opcional)"
                inputMode="decimal"
                description="Para el mapa. Vacía: se busca con la dirección."
              />
              <TextField
                control={control}
                name="longitude"
                label="Longitud (opcional)"
                inputMode="decimal"
                description="Por ejemplo -58.4321."
              />
            </div>
          </Section>

          <Section
            title="Para publicar"
            description="Lo que ven la web y los portales. Si lo dejás vacío, se arma solo."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={control}
                name="publishAddress"
                label="Dirección para publicar (opcional)"
                description='Vacío: la calle con la altura redondeada, por ejemplo "Gurruchaga al 1800".'
              />
              <TextField
                control={control}
                name="portalTitle"
                label="Título para portales (opcional)"
                description="Vacío: el nombre del emprendimiento."
              />
            </div>
          </Section>

          <Section title="Datos privados" description="Solo los ve el equipo de Norde.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={control}
                name="developerName"
                label="Desarrollista (opcional)"
                autoComplete="off"
              />
              <PickerField
                control={control}
                name="commercialContactClientId"
                label="Contacto comercial (opcional)"
                loadPage={loadContacts}
                placeholder="Buscar contacto"
                searchPlaceholder="Nombre, teléfono o email"
                clearLabel="Quitar contacto comercial"
              />
            </div>
          </Section>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Crear emprendimiento
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
