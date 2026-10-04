'use client';

import {
  CURRENCIES,
  MAX_APPRAISAL_COMPARABLES,
  MAX_APPRAISAL_OBSERVATIONS_LENGTH,
  RecordAppraisalResultInputSchema,
  type AppraisalDetail,
  type AppraisalValueRangeDto,
  type RecordAppraisalResultInput,
} from '@norde/core/appraisals/contracts';
import { Button } from '@norde/ui/components/button';
import { Form } from '@norde/ui/components/form';
import { ExternalLinkIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';

import { EMPTY_VALUE, formatMoney } from '../../../lib/format';
import { contractResolver } from '../../../lib/form';
import { centsToAmount } from '../../properties/components/detail/sections-listing';
import { CURRENCY_LABELS } from '../../properties/labels';
import {
  SelectField,
  submitWith,
  TextareaField,
  TextField,
} from '../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import { recordAppraisalResultAction } from '../actions';

/** "US$ 110.000 a US$ 120.000". */
function formatRange(range: AppraisalValueRangeDto | undefined): string {
  if (range === undefined) return 'Sin cargar';
  const { currency } = range;
  const min = formatMoney({ amountCents: range.minCents, currency });
  const max = formatMoney({ amountCents: range.maxCents, currency });
  return range.minCents === range.maxCents ? max : `${min} a ${max}`;
}

function formatSurface(m2: number | undefined): string {
  return m2 === undefined ? EMPTY_VALUE : `${m2.toLocaleString('es-AR')} m²`;
}

function ResultView({ result }: { readonly result: AppraisalDetail['result'] }) {
  return (
    <div className="flex flex-col gap-5">
      <Facts
        items={[
          { label: 'Valor sugerido de venta', value: formatRange(result.sale) },
          { label: 'Valor sugerido de alquiler', value: formatRange(result.rent) },
        ]}
      />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Comparables</h3>
        {result.comparables.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin comparables. Son propiedades parecidas de la zona, publicadas o vendidas, que
            respaldan el valor sugerido.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.comparables.map((comparable, index) => (
              <li
                // Los comparables no tienen ID: la lista se reemplaza entera al guardar.
                key={`${comparable.address}-${String(index)}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium break-words">{comparable.address}</p>
                  {comparable.url !== undefined && (
                    <a
                      href={comparable.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Ver publicación
                      <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                </div>
                <Facts
                  columns={3}
                  items={[
                    { label: 'Precio', value: formatMoney(comparable.price) },
                    { label: 'Superficie', value: formatSurface(comparable.surfaceM2) },
                    {
                      label: 'Valor por m²',
                      value:
                        comparable.pricePerM2 === undefined
                          ? EMPTY_VALUE
                          : formatMoney(comparable.pricePerM2),
                    },
                  ]}
                />
                {comparable.note !== undefined && (
                  <p className="text-sm whitespace-pre-line text-muted-foreground">
                    {comparable.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">Observaciones</p>
        <p className="text-sm whitespace-pre-line">{result.observations ?? EMPTY_VALUE}</p>
      </div>
    </div>
  );
}

function defaults(detail: AppraisalDetail): RecordAppraisalResultInput {
  const { sale, rent, comparables, observations } = detail.result;
  return {
    appraisalId: detail.id,
    saleMin: centsToAmount(sale?.minCents),
    saleMax: centsToAmount(sale?.maxCents),
    saleCurrency: sale?.currency ?? 'USD',
    rentMin: centsToAmount(rent?.minCents),
    rentMax: centsToAmount(rent?.maxCents),
    rentCurrency: rent?.currency ?? 'ARS',
    comparables: comparables.map((comparable) => ({
      address: comparable.address,
      price: centsToAmount(comparable.price.amountCents),
      currency: comparable.price.currency,
      surfaceM2: comparable.surfaceM2 === undefined ? '' : String(comparable.surfaceM2),
      url: comparable.url ?? '',
      note: comparable.note ?? '',
    })),
    observations: observations ?? '',
  };
}

function ValueRangeFields({
  form,
  operation,
  label,
}: {
  readonly form: ReturnType<typeof useForm<RecordAppraisalResultInput>>;
  readonly operation: 'sale' | 'rent';
  readonly label: string;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          control={form.control}
          name={`${operation}Min`}
          label="Mínimo"
          inputMode="decimal"
        />
        <TextField
          control={form.control}
          name={`${operation}Max`}
          label="Máximo"
          inputMode="decimal"
        />
        <SelectField
          control={form.control}
          name={`${operation}Currency`}
          label="Moneda"
          options={CURRENCIES}
          labels={CURRENCY_LABELS}
        />
      </div>
    </fieldset>
  );
}

function ResultForm({
  detail,
  controls,
}: {
  readonly detail: AppraisalDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<RecordAppraisalResultInput>({
    resolver: contractResolver(RecordAppraisalResultInputSchema),
    defaultValues: defaults(detail),
  });
  const comparables = useFieldArray({ control: form.control, name: 'comparables' });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={submitWith(form, (values) => {
          controls.save(() => recordAppraisalResultAction(values), 'Resultado guardado.');
        })}
      >
        <p className="text-sm text-muted-foreground">
          Montos sin puntos de miles. De cada operación se cargan los dos valores o ninguno; al
          convertir en propiedad, se publica al máximo.
        </p>
        <ValueRangeFields form={form} operation="sale" label="Valor sugerido de venta" />
        <ValueRangeFields form={form} operation="rent" label="Valor sugerido de alquiler" />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">Comparables</legend>
          {comparables.fields.map((field, index) => (
            <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    control={form.control}
                    name={`comparables.${index}.address`}
                    label="Dirección"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6"
                  aria-label={`Quitar el comparable ${String(index + 1)}`}
                  onClick={() => {
                    comparables.remove(index);
                  }}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  control={form.control}
                  name={`comparables.${index}.price`}
                  label="Precio"
                  inputMode="decimal"
                />
                <SelectField
                  control={form.control}
                  name={`comparables.${index}.currency`}
                  label="Moneda"
                  options={CURRENCIES}
                  labels={CURRENCY_LABELS}
                />
                <TextField
                  control={form.control}
                  name={`comparables.${index}.surfaceM2`}
                  label="Superficie (m²)"
                  inputMode="decimal"
                />
              </div>
              <TextField
                control={form.control}
                name={`comparables.${index}.url`}
                label="Link a la publicación"
                type="url"
                placeholder="https://"
              />
              <TextField control={form.control} name={`comparables.${index}.note`} label="Nota" />
            </div>
          ))}
          {comparables.fields.length < MAX_APPRAISAL_COMPARABLES && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => {
                comparables.append({
                  address: '',
                  price: '',
                  currency: 'USD',
                  surfaceM2: '',
                  url: '',
                  note: '',
                });
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Agregar comparable
            </Button>
          )}
        </fieldset>

        <TextareaField
          control={form.control}
          name="observations"
          label="Observaciones"
          description={`Hasta ${MAX_APPRAISAL_OBSERVATIONS_LENGTH.toLocaleString('es-AR')} caracteres.`}
        />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

/** El resultado de la tasación: valores sugeridos, comparables y observaciones. */
export function AppraisalResultSection({
  detail,
  canEdit,
}: {
  readonly detail: AppraisalDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Resultado"
      canEdit={canEdit}
      view={<ResultView result={detail.result} />}
      form={(controls) => <ResultForm detail={detail} controls={controls} />}
    />
  );
}
