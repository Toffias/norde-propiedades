'use client';

import {
  CURRENCIES,
  MAX_DESCRIPTION_LENGTH,
  OPERATIONS,
  UpdatePropertyDescriptionInputSchema,
  UpdatePropertyLocationInputSchema,
  UpdatePropertyOperationsInputSchema,
  type Operation,
  type PanelPropertyDetail,
  type UpdatePropertyDescriptionInput,
  type UpdatePropertyLocationInput,
  type UpdatePropertyOperationsInput,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { toast } from '@norde/ui/components/sonner';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { EMPTY_VALUE, formatMoney } from '../../../../lib/format';
import { contractResolver } from '../../../../lib/form';
import { EntityPicker } from '../../../identity/components/entity-picker';
import { loadLocationOptions } from '../../actions';
import {
  updatePropertyDescriptionAction,
  updatePropertyLocationAction,
  updatePropertyOperationsAction,
} from '../../detail-actions';
import { CURRENCY_LABELS, OPERATION_LABELS } from '../../labels';
import {
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
  submitWith,
} from '../../../shared/components/form-fields';
import { Facts, InlineFormActions, InlineSection } from '../../../shared/components/inline-section';

/** Centavos → lo que se escribe en el formulario ("120000", "1500,50"). */
export function centsToAmount(cents: bigint | undefined): string {
  if (cents === undefined) return '';
  const units = (cents / 100n).toString();
  const fraction = cents % 100n;
  return fraction === 0n ? units : `${units},${fraction.toString().padStart(2, '0')}`;
}

function text(value: string | undefined): string {
  return value === undefined || value === '' ? EMPTY_VALUE : value;
}

// ---------- Ubicación ----------

export function LocationSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  const { address } = detail;
  const place = detail.locationPath.map((level) => level.name).join(' › ');
  return (
    <InlineSection
      title="Ubicación"
      canEdit={canEdit}
      view={
        <Facts
          items={[
            {
              label: 'Dirección real (privada)',
              value: text([address.street, address.streetNumber].filter(Boolean).join(' ')),
            },
            {
              label: 'Piso y unidad',
              value: text([address.floor, address.unit].filter(Boolean).join(' · ')),
            },
            { label: 'Dirección para publicar', value: text(detail.publishAddress) },
            {
              label: 'Ubicación',
              value: text(
                place === ''
                  ? [address.neighborhood, address.city, address.province]
                      .filter((part) => part !== '')
                      .join(', ')
                  : place,
              ),
            },
            {
              label: 'Coordenadas',
              value:
                detail.coordinates === undefined
                  ? 'Sin ubicar en el mapa'
                  : `${detail.coordinates.latitude.toFixed(5)}, ${detail.coordinates.longitude.toFixed(5)}`,
            },
          ]}
        />
      }
      form={(controls) => <LocationForm detail={detail} controls={controls} />}
    />
  );
}

const GEOCODING_MESSAGES = {
  manual: 'Ubicación guardada.',
  found: 'Ubicación guardada. La ubicamos de nuevo en el mapa.',
  not_found: 'Ubicación guardada, pero no la encontramos en el mapa: cargá las coordenadas.',
  failed: 'Ubicación guardada. El mapa no respondió: quedaron las coordenadas anteriores.',
  unchanged: 'Ubicación guardada.',
} as const;

function LocationForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: Parameters<Parameters<typeof InlineSection>[0]['form']>[0];
}) {
  const { address } = detail;
  const location = detail.locationPath.at(-1);
  const form = useForm<UpdatePropertyLocationInput>({
    resolver: contractResolver(UpdatePropertyLocationInputSchema),
    defaultValues: {
      propertyId: detail.id,
      street: address.street,
      streetNumber: address.streetNumber ?? '',
      floor: address.floor ?? '',
      unit: address.unit ?? '',
      locationId: detail.locationId,
      neighborhood: address.neighborhood,
      city: address.city,
      province: address.province,
      publishAddress: detail.publishAddress,
      latitude: detail.coordinates?.latitude,
      longitude: detail.coordinates?.longitude,
    },
  });
  const locationId = useWatch({ control: form.control, name: 'locationId' });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, () => {
          controls.save(async () => {
            const result = await updatePropertyLocationAction(form.getValues());
            if (result.ok && result.geocoding !== undefined && result.geocoding !== 'unchanged') {
              toast.info(GEOCODING_MESSAGES[result.geocoding]);
            }
            return result;
          }, 'Ubicación guardada.');
        })}
      >
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <TextField control={form.control} name="street" label="Calle" />
          <TextField control={form.control} name="streetNumber" label="Altura" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="floor" label="Piso" />
          <TextField control={form.control} name="unit" label="Unidad" />
        </div>
        <FormField
          control={form.control}
          name="locationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ubicación del catálogo</FormLabel>
              <FormControl>
                <EntityPicker
                  value={field.value}
                  initial={
                    location === undefined
                      ? undefined
                      : { value: location.id, label: location.name }
                  }
                  onChange={field.onChange}
                  loadPage={loadLocationOptions}
                  placeholder="Buscá el barrio o la localidad"
                  searchPlaceholder="Buscar ubicación"
                  clearLabel="Quitar la ubicación"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {locationId === undefined && (
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="neighborhood" label="Barrio" />
            <TextField control={form.control} name="city" label="Localidad" />
            <TextField control={form.control} name="province" label="Provincia" />
          </div>
        )}
        <TextField
          control={form.control}
          name="publishAddress"
          label="Dirección para publicar"
          description="Vacía: se sugiere a partir de la calle y la altura."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="latitude" label="Latitud" inputMode="decimal" />
          <TextField control={form.control} name="longitude" label="Longitud" inputMode="decimal" />
        </div>
        <p className="text-xs text-muted-foreground">
          Sin coordenadas, si cambia la dirección se ubica de nuevo en el mapa.
        </p>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Operaciones ----------

export function OperationsSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Operaciones y precios"
      canEdit={canEdit}
      view={
        <ul className="flex flex-col divide-y divide-border">
          {detail.operations.map((operation) => (
            <li
              key={operation.operation}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
            >
              <span className="w-40 text-sm font-semibold">
                {OPERATION_LABELS[operation.operation]}
              </span>
              <span className="text-sm tabular-nums">
                {operation.priceCents === undefined
                  ? 'Sin precio cargado'
                  : formatMoney({
                      amountCents: operation.priceCents,
                      currency: operation.currency,
                    })}
              </span>
              {operation.priceOnRequest && (
                <span className="text-xs text-muted-foreground">Precio a consultar en la web</span>
              )}
              {operation.commissionPct !== undefined && (
                <span className="text-xs text-muted-foreground">
                  Comisión {operation.commissionPct.toLocaleString('es-AR')} %
                </span>
              )}
            </li>
          ))}
        </ul>
      }
      form={(controls) => <OperationsForm detail={detail} controls={controls} />}
    />
  );
}

function OperationsForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: Parameters<Parameters<typeof InlineSection>[0]['form']>[0];
}) {
  const form = useForm<UpdatePropertyOperationsInput>({
    resolver: contractResolver(UpdatePropertyOperationsInputSchema),
    defaultValues: {
      propertyId: detail.id,
      operations: detail.operations.map((operation) => ({
        operation: operation.operation,
        currency: operation.currency,
        price: centsToAmount(operation.priceCents),
        priceOnRequest: operation.priceOnRequest,
        commissionPct:
          operation.commissionPct === undefined
            ? ''
            : operation.commissionPct.toString().replace('.', ','),
      })),
    },
  });
  const operations = useFieldArray({ control: form.control, name: 'operations' });
  const used = new Set(
    useWatch({ control: form.control, name: 'operations' }).map((operation) => operation.operation),
  );
  const next: Operation | undefined = OPERATIONS.find((operation) => !used.has(operation));

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updatePropertyOperationsAction(values), 'Operaciones guardadas.');
        })}
      >
        {operations.fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <SelectField
                control={form.control}
                name={`operations.${index}.operation`}
                label="Operación"
                options={OPERATIONS}
                labels={OPERATION_LABELS}
              />
              <SelectField
                control={form.control}
                name={`operations.${index}.currency`}
                label="Moneda"
                options={CURRENCIES}
                labels={CURRENCY_LABELS}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar la operación"
                  disabled={operations.fields.length === 1}
                  onClick={() => {
                    operations.remove(index);
                  }}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                control={form.control}
                name={`operations.${index}.price`}
                label="Precio"
                inputMode="decimal"
                description="Sin puntos de miles. Vacío: sin precio cargado."
              />
              <TextField
                control={form.control}
                name={`operations.${index}.commissionPct`}
                label="Comisión (%)"
                inputMode="decimal"
              />
            </div>
            <SwitchField
              control={form.control}
              name={`operations.${index}.priceOnRequest`}
              label="Precio a consultar"
              description="La web y los portales no muestran el precio de esta operación."
            />
          </div>
        ))}
        {next !== undefined && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => {
              operations.append({
                operation: next,
                currency: 'USD',
                price: '',
                priceOnRequest: false,
              });
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Agregar {OPERATION_LABELS[next].toLowerCase()}
          </Button>
        )}
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Descripción ----------

export function DescriptionSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Título y descripción"
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-3">
          <Facts items={[{ label: 'Título para portales', value: detail.portalTitle }]} />
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">Descripción</p>
            <p className="text-sm whitespace-pre-line">
              {detail.description === '' ? 'Sin descripción todavía.' : detail.description}
            </p>
          </div>
        </div>
      }
      form={(controls) => <DescriptionForm detail={detail} controls={controls} />}
    />
  );
}

function DescriptionForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: Parameters<Parameters<typeof InlineSection>[0]['form']>[0];
}) {
  const form = useForm<UpdatePropertyDescriptionInput>({
    resolver: contractResolver(UpdatePropertyDescriptionInputSchema),
    defaultValues: {
      propertyId: detail.id,
      portalTitle: detail.portalTitle,
      description: detail.description,
    },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updatePropertyDescriptionAction(values), 'Descripción guardada.');
        })}
      >
        <TextField
          control={form.control}
          name="portalTitle"
          label="Título para portales"
          maxLength={120}
          description="Vacío: se sugiere a partir del tipo, la operación y el barrio."
        />
        <TextareaField
          control={form.control}
          name="description"
          label="Descripción"
          rows={8}
          description={`Hasta ${MAX_DESCRIPTION_LENGTH.toLocaleString('es-AR')} caracteres.`}
        />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}
