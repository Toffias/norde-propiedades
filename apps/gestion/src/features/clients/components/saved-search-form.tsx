'use client';

import {
  CreateSavedSearchInputSchema,
  type CreateSavedSearchInput,
  type SavedSearchDetail,
} from '@norde/core/clients/contracts';
import { CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Form } from '@norde/ui/components/form';
import { Label } from '@norde/ui/components/label';
import { PagedMultiSelect, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { runAction } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { loadLocationOptions } from '../../properties/actions';
import { centsToAmount } from '../../properties/components/detail/sections-listing';
import { CURRENCY_LABELS, OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../../properties/labels';
import { FormAlert } from '../../shared/components/form-alert';
import {
  ChecklistField,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from '../../shared/components/form-fields';
import { createSavedSearchAction, updateSavedSearchAction } from '../saved-search-actions';

type SavedSearchValues = CreateSavedSearchInput;

/** Criterios para precargar una búsqueda nueva (los filtros del buscador). */
export type SavedSearchPrefill = Partial<
  Pick<SavedSearchValues, 'operation' | 'propertyTypes' | 'currency' | 'minPrice' | 'maxPrice'>
>;

function initialValues(
  clientId: string,
  search: SavedSearchDetail | undefined,
  prefill: SavedSearchPrefill,
): SavedSearchValues {
  if (search === undefined) {
    return {
      clientId,
      name: '',
      operation: prefill.operation ?? 'sale',
      propertyTypes: prefill.propertyTypes ?? [],
      currency: prefill.currency,
      minPrice: prefill.minPrice ?? '',
      maxPrice: prefill.maxPrice ?? '',
      locationIds: [],
      minRooms: undefined,
      autoSend: false,
    };
  }
  return {
    clientId,
    name: search.name ?? '',
    // Una búsqueda importada puede traer una operación que el panel no ofrece: se elige otra.
    operation: OPERATIONS.find((o) => o === search.operation) ?? 'sale',
    propertyTypes: PROPERTY_TYPES.filter((type) => search.propertyTypes.includes(type)),
    currency: CURRENCIES.find((c) => c === search.currency),
    minPrice: centsToAmount(search.minPriceCents),
    maxPrice: centsToAmount(search.maxPriceCents),
    locationIds: search.locations.map((location) => location.id),
    minRooms: search.minRooms,
    autoSend: search.autoSend,
  };
}

const TYPE_OPTIONS = PROPERTY_TYPES.map((type) => ({
  value: type,
  label: PROPERTY_TYPE_LABELS[type],
}));

/**
 * Alta o edición de una búsqueda guardada de un contacto, dentro de un panel lateral. Sin
 * `clientId` (desde el buscador, todavía sin elegir el contacto), no se puede guardar.
 */
export function SavedSearchForm({
  clientId,
  search,
  prefill = {},
  activeOpportunityId,
  readOnly,
  before,
  notice,
  onDone,
}: {
  readonly clientId: string | undefined;
  readonly search: SavedSearchDetail | undefined;
  readonly prefill?: SavedSearchPrefill;
  /** La oportunidad abierta del contacto, para atarle la búsqueda. */
  readonly activeOpportunityId: string | undefined;
  readonly readOnly: boolean;
  /** Lo que va arriba de los campos (el selector de contacto). */
  readonly before?: ReactNode;
  /** Un aviso arriba de los campos (lo que no se pudo precargar). */
  readonly notice?: string | undefined;
  readonly onDone: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | undefined>();
  const [locations, setLocations] = useState<readonly ComboboxOption[]>(
    (search?.locations ?? []).map((location) => ({
      value: location.id,
      label: location.name,
      ...(location.hint === undefined ? {} : { hint: location.hint }),
    })),
  );
  const [linked, setLinked] = useState(
    search === undefined ? activeOpportunityId !== undefined : search.opportunityId !== undefined,
  );
  const form = useForm<SavedSearchValues>({
    resolver: contractResolver(CreateSavedSearchInputSchema),
    defaultValues: initialValues(clientId ?? '', search, prefill),
  });
  useEffect(() => {
    form.setValue('clientId', clientId ?? '');
  }, [clientId, form]);
  // Atada a una oportunidad que ya se cerró: se mantiene mientras no se destilde.
  const opportunityId = search?.opportunityId ?? activeOpportunityId;

  async function submit(values: SavedSearchValues) {
    setError(undefined);
    if (clientId === undefined) {
      setError('Elegí el contacto.');
      return;
    }
    const input = {
      ...values,
      clientId,
      ...(linked && opportunityId !== undefined ? { opportunityId } : { opportunityId: undefined }),
    };
    const message = await runAction(() =>
      search === undefined
        ? createSavedSearchAction(input)
        : updateSavedSearchAction({ ...input, savedSearchId: search.id }),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(search === undefined ? 'Búsqueda guardada' : 'Cambios guardados');
    onDone();
  }

  const pending = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => {
          // Desde el buscador el contacto se elige afuera de los campos: se pide antes de validar.
          if (clientId === undefined) {
            event.preventDefault();
            setError('Elegí el contacto.');
            return;
          }
          void form.handleSubmit(submit)(event);
        }}
      >
        <SheetBody scroll>
          <FormAlert message={error} />
          {before}
          {notice !== undefined && <p className="text-sm text-muted-foreground">{notice}</p>}
          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <TextField
              control={form.control}
              name="name"
              label="Nombre (opcional)"
              autoComplete="off"
              description="Sin nombre, se muestra la operación y los tipos."
            />
            <SelectField
              control={form.control}
              name="operation"
              label="Operación"
              options={OPERATIONS}
              labels={OPERATION_LABELS}
            />
            <ChecklistField
              control={form.control}
              name="propertyTypes"
              label="Tipos (ninguno: cualquiera)"
              options={TYPE_OPTIONS}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-locations`}>Ubicaciones (ninguna: cualquiera)</Label>
              <PagedMultiSelect
                id={`${id}-locations`}
                value={locations}
                onChange={(next) => {
                  setLocations(next);
                  form.setValue(
                    'locationIds',
                    next.map((option) => option.value),
                    { shouldDirty: true },
                  );
                }}
                loadPage={loadLocationOptions}
                placeholder="Cualquiera"
                searchPlaceholder="Buscar barrio o localidad"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                control={form.control}
                name="currency"
                label="Moneda"
                options={CURRENCIES}
                labels={CURRENCY_LABELS}
                empty="Sin precio"
              />
              <TextField
                control={form.control}
                name="minPrice"
                label="Desde"
                inputMode="decimal"
                autoComplete="off"
              />
              <TextField
                control={form.control}
                name="maxPrice"
                label="Hasta"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <NumberField
              control={form.control}
              name="minRooms"
              label="Ambientes mínimos (opcional)"
              step="1"
            />
            <SwitchField
              control={form.control}
              name="autoSend"
              label="Envío automático"
              description={
                search?.unsubscribed === true
                  ? 'El contacto se dio de baja de los envíos automáticos.'
                  : 'Le manda por email las propiedades nuevas que coinciden. Los envíos se activan próximamente.'
              }
            />
            {opportunityId !== undefined && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Atar a la oportunidad abierta</span>
                  <span className="text-muted-foreground">
                    La búsqueda queda en la oportunidad del contacto.
                  </span>
                </span>
                <Switch checked={linked} onCheckedChange={setLinked} />
              </label>
            )}
          </fieldset>
        </SheetBody>
        {!readOnly && (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {search === undefined ? 'Guardar búsqueda' : 'Guardar cambios'}
            </Button>
          </SheetFooter>
        )}
      </form>
    </Form>
  );
}
