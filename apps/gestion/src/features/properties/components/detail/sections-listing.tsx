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
  type PanelPropertyDetailOperation,
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
import { Badge } from '@norde/ui/components/badge';
import { SectionCard } from '@norde/ui/components/section-card';
import { cn } from '@norde/ui/lib/utils';
import {
  BanknoteIcon,
  CalendarDaysIcon,
  FileTextIcon,
  KeyRoundIcon,
  MapIcon,
  MapPinIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { LocationMapView } from './location-map-view';

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

// ---------- Mapa ----------

/** Solo lectura: las coordenadas se editan en la tarjeta Ubicación. */
export function MapSection({ detail }: { readonly detail: PanelPropertyDetail }) {
  return (
    <SectionCard title="Mapa" icon={MapIcon} bodyClassName="flex flex-1 flex-col">
      <LocationMapView
        coordinates={detail.coordinates}
        emptyMessage="Sin coordenadas: cargalas editando la Ubicación o completá la dirección para buscarlas."
      />
    </SectionCard>
  );
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
      icon={MapPinIcon}
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

const OPERATION_ICONS: Readonly<Record<Operation, LucideIcon>> = {
  sale: TagIcon,
  rent: KeyRoundIcon,
  temporary_rent: CalendarDaysIcon,
};

export function OperationsSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  // La operación que se eligió agregar desde la vista: el formulario la abre ya sumada.
  const [adding, setAdding] = useState<Operation | undefined>();
  const used = new Set(detail.operations.map((operation) => operation.operation));
  const missing = canEdit ? OPERATIONS.filter((operation) => !used.has(operation)) : [];
  // Las que faltan van juntas en una sola tarjeta: con una operación cargada, entra en una fila.
  const slots = detail.operations.length + (missing.length > 0 ? 1 : 0);

  return (
    <InlineSection
      title="Operaciones y precios"
      icon={BanknoteIcon}
      canEdit={canEdit}
      bodyClassName="@container flex flex-1 flex-col"
      view={(edit) => (
        <div
          className={cn(
            'grid flex-1 auto-rows-fr grid-cols-1 gap-3',
            slots >= 2 && '@md:grid-cols-2',
            // En dos columnas, la última que queda sola ocupa el ancho: sin huecos.
            slots >= 2 && '@md:[&>:last-child:nth-child(odd)]:col-span-2',
            slots >= 3 && '@2xl:grid-cols-3 @2xl:[&>:last-child:nth-child(odd)]:col-span-1',
          )}
        >
          {detail.operations.map((operation) => (
            <OperationTile key={operation.operation} operation={operation} />
          ))}
          {missing.length > 0 && (
            <AddOperationsTile
              operations={missing}
              onAdd={(operation) => {
                setAdding(operation);
                edit();
              }}
            />
          )}
        </div>
      )}
      form={(controls) => (
        <OperationsForm detail={detail} adding={adding} onClose={setAdding} controls={controls} />
      )}
    />
  );
}

function money(cents: bigint, currency: PanelPropertyDetailOperation['currency']): string {
  return formatMoney({ amountCents: cents, currency });
}

/** Una operación: el precio grande y, abajo, el precio por m² y la comisión estimada. */
function OperationTile({ operation }: { readonly operation: PanelPropertyDetailOperation }) {
  const Icon = OPERATION_ICONS[operation.operation];
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-3.5" aria-hidden />
          </span>
          <span className="truncate">{OPERATION_LABELS[operation.operation]}</span>
        </span>
        {operation.priceOnRequest && <Badge variant="outline">A consultar</Badge>}
      </div>
      <p
        className={cn(
          'leading-none font-bold tabular-nums',
          operation.priceCents === undefined ? 'text-base text-muted-foreground' : 'text-xl',
        )}
      >
        {operation.priceCents === undefined
          ? 'Sin precio cargado'
          : money(operation.priceCents, operation.currency)}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Por m² total</dt>
          <dd className="truncate text-sm font-medium tabular-nums">
            {operation.pricePerM2Cents === undefined
              ? EMPTY_VALUE
              : money(operation.pricePerM2Cents, operation.currency)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">
            Comisión
            {operation.commissionPct !== undefined &&
              ` ${operation.commissionPct.toLocaleString('es-AR')} %`}
          </dt>
          <dd className="truncate text-sm font-medium tabular-nums">
            {operation.estimatedCommissionCents === undefined
              ? EMPTY_VALUE
              : `≈ ${money(operation.estimatedCommissionCents, operation.currency)}`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Las operaciones que la propiedad no ofrece, apiladas en una columna: cada una con su borde
 * punteado, repartidas en el alto de la tarjeta de al lado. Invitan a cargarlas.
 */
function AddOperationsTile({
  operations,
  onAdd,
}: {
  readonly operations: readonly Operation[];
  readonly onAdd: (operation: Operation) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {operations.map((operation) => {
        const Icon = OPERATION_ICONS[operation];
        return (
          <button
            key={operation}
            type="button"
            onClick={() => {
              onAdd(operation);
            }}
            className="group flex flex-1 items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm font-semibold text-muted-foreground transition-colors outline-none hover:border-primary hover:bg-primary/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">
              Agregar {OPERATION_LABELS[operation].toLowerCase()}
            </span>
            <PlusIcon
              className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

function OperationsForm({
  detail,
  adding,
  onClose,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  /** La operación que se eligió agregar desde la vista, ya sumada al formulario. */
  readonly adding: Operation | undefined;
  /** Al cerrar el formulario (guardar o cancelar), se olvida la operación elegida. */
  readonly onClose: (adding: undefined) => void;
  readonly controls: Parameters<Parameters<typeof InlineSection>[0]['form']>[0];
}) {
  const form = useForm<UpdatePropertyOperationsInput>({
    resolver: contractResolver(UpdatePropertyOperationsInputSchema),
    defaultValues: {
      propertyId: detail.id,
      operations: [
        ...detail.operations.map((operation) => ({
          operation: operation.operation,
          currency: operation.currency,
          price: centsToAmount(operation.priceCents),
          priceOnRequest: operation.priceOnRequest,
          commissionPct:
            operation.commissionPct === undefined
              ? ''
              : operation.commissionPct.toString().replace('.', ','),
        })),
        ...(adding === undefined
          ? []
          : [{ operation: adding, currency: 'USD' as const, price: '', priceOnRequest: false }]),
      ],
    },
  });
  useEffect(
    () => () => {
      onClose(undefined);
    },
    [onClose],
  );
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
      icon={FileTextIcon}
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
