'use client';

import {
  CONDITION_VALUES,
  CreateAppraisalInputSchema,
  PROPERTY_TYPES,
  type AppraisalDetail,
  type CreateAppraisalInput,
} from '@norde/core/appraisals/contracts';
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
import { toast } from '@norde/ui/components/sonner';
import { ClipboardListIcon, Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { contractResolver } from '../../../lib/form';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import { loadClientOptions } from '../../clients/actions';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { CONDITION_LABELS } from '../../properties/detail-labels';
import { PROPERTY_TYPE_LABELS } from '../../properties/labels';
import { FormAlert } from '../../shared/components/form-alert';
import { NumberField, SelectField, TextField } from '../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import { createAppraisalAction, updateAppraisalAction } from '../actions';
import { toVisitInput } from '../visit-input';
import { useIdempotencyKey } from '../../shared/hooks/use-idempotency-key';

type Values = CreateAppraisalInput;
type Valid = z.output<typeof CreateAppraisalInputSchema>;

function defaults(detail: AppraisalDetail | undefined): Values {
  if (detail === undefined) {
    return {
      requesterClientId: '',
      producerUserId: undefined,
      appraiserUserId: undefined,
      visitAt: '',
      propertyType: 'apartment',
      address: '',
      surfaceTotalM2: undefined,
      surfaceCoveredM2: undefined,
      rooms: undefined,
      bedrooms: undefined,
      bathrooms: undefined,
      condition: undefined,
    };
  }
  return {
    requesterClientId: detail.requester.id,
    producerUserId: detail.producer.id,
    appraiserUserId: detail.appraiser?.id,
    visitAt: toVisitInput(detail.visitAt),
    propertyType: detail.propertyType,
    address: detail.address ?? '',
    surfaceTotalM2: detail.surfaceTotalM2,
    surfaceCoveredM2: detail.surfaceCoveredM2,
    rooms: detail.rooms,
    bedrooms: detail.bedrooms,
    bathrooms: detail.bathrooms,
    condition: detail.condition,
  };
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-sm font-semibold text-foreground">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Alta y edición de una tasación: quién la pide, quién la trae y quién la hace, la visita y los
 * datos de la propiedad. Con `controls`, edita la tasación dentro de su sección de la ficha.
 */
export function AppraisalForm({
  detail,
  controls,
}: {
  /** La tasación a editar; sin ella, es una nueva. */
  readonly detail?: AppraisalDetail | undefined;
  /** Guardar y cancelar de la sección en línea, al editar. */
  readonly controls?: InlineFormControls | undefined;
}) {
  const router = useRouter();
  const editing = detail !== undefined;
  const [error, setError] = useState<string | undefined>();
  const idempotency = useIdempotencyKey();
  const form = useForm<Values, unknown, Valid>({
    resolver: contractResolver(CreateAppraisalInputSchema),
    defaultValues: defaults(detail),
  });
  const { control } = form;
  const pending = form.formState.isSubmitting;

  async function submit(values: Valid) {
    setError(undefined);
    if (detail !== undefined && controls !== undefined) {
      controls.save(
        () => updateAppraisalAction({ appraisalId: detail.id, ...values }),
        'Tasación guardada.',
      );
      return;
    }
    try {
      const result = await createAppraisalAction({
        ...values,
        idempotencyKey: idempotency.key,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      idempotency.renew();
      toast.success(`Tasación ${result.code ?? ''} cargada`);
      // La ficha de la tasación nueva: typedRoutes no verifica un segmento armado.
      router.push(`/tasaciones/${result.appraisalId ?? ''}` as Route);
    } catch {
      setError(UNEXPECTED_ERROR_MESSAGE);
    }
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <FormAlert message={error} />
        <Section title="Solicitud">
          <FormField
            control={control}
            name="requesterClientId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Solicitante</FormLabel>
                <FormControl>
                  <EntityPicker
                    value={field.value === '' ? undefined : field.value}
                    initial={
                      detail === undefined
                        ? undefined
                        : {
                            value: detail.requester.id,
                            label: detail.requester.name ?? 'Contacto sin datos',
                          }
                    }
                    onChange={(id) => {
                      field.onChange(id ?? '');
                    }}
                    loadPage={loadClientOptions}
                    placeholder="Buscalo por nombre, teléfono o email"
                    searchPlaceholder="Buscar contacto"
                  />
                </FormControl>
                <FormDescription>El propietario que pide la tasación.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="producerUserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Productor</FormLabel>
                <FormControl>
                  <EntityPicker
                    value={field.value}
                    initial={
                      detail === undefined
                        ? undefined
                        : {
                            value: detail.producer.id,
                            label: detail.producer.name ?? 'Usuario inactivo',
                          }
                    }
                    onChange={field.onChange}
                    loadPage={loadUserOptions}
                    placeholder="Vos"
                    searchPlaceholder="Buscar usuario"
                  />
                </FormControl>
                {!editing && (
                  <FormDescription>Quien trae la tasación. Sin elegir, quedás vos.</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="appraiserUserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tasador</FormLabel>
                <FormControl>
                  <EntityPicker
                    value={field.value}
                    initial={
                      detail?.appraiser === undefined
                        ? undefined
                        : {
                            value: detail.appraiser.id,
                            label: detail.appraiser.name ?? 'Usuario inactivo',
                          }
                    }
                    onChange={field.onChange}
                    loadPage={loadUserOptions}
                    placeholder="Sin asignar"
                    searchPlaceholder="Buscar usuario"
                    clearLabel="Quitar tasador"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextField
            control={control}
            name="visitAt"
            label="Visita"
            type="datetime-local"
            description="Día y hora en que se visita la propiedad."
          />
        </Section>

        <Section title="Propiedad">
          <SelectField
            control={control}
            name="propertyType"
            label="Tipo de propiedad"
            options={PROPERTY_TYPES}
            labels={PROPERTY_TYPE_LABELS}
          />
          <TextField
            control={control}
            name="address"
            label="Dirección"
            placeholder="Calle, número, piso y depto"
          />
          <NumberField control={control} name="surfaceTotalM2" label="Superficie total (m²)" />
          <NumberField control={control} name="surfaceCoveredM2" label="Superficie cubierta (m²)" />
          <NumberField control={control} name="rooms" label="Ambientes" step="1" />
          <NumberField control={control} name="bedrooms" label="Dormitorios" step="1" />
          <NumberField control={control} name="bathrooms" label="Baños" step="1" />
          <SelectField
            control={control}
            name="condition"
            label="Estado de conservación"
            options={CONDITION_VALUES}
            labels={CONDITION_LABELS}
            empty="Sin dato"
          />
        </Section>

        {controls === undefined ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                router.push('/tasaciones');
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Cargar tasación
            </Button>
          </div>
        ) : (
          <InlineFormActions controls={controls} />
        )}
      </form>
    </Form>
  );
}

function text(value: string | undefined): string {
  return value === undefined || value === '' ? EMPTY_VALUE : value;
}

function amount(value: number | undefined, unit = ''): string {
  return value === undefined ? EMPTY_VALUE : `${value.toLocaleString('es-AR')}${unit}`;
}

function DataView({ detail }: { readonly detail: AppraisalDetail }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Solicitud</h3>
        <Facts
          items={[
            { label: 'Solicitante', value: detail.requester.name ?? 'Contacto sin datos' },
            { label: 'Productor', value: detail.producer.name ?? 'Usuario inactivo' },
            {
              label: 'Tasador',
              value:
                detail.appraiser === undefined
                  ? 'Sin asignar'
                  : (detail.appraiser.name ?? 'Usuario inactivo'),
            },
            { label: 'Visita', value: formatDateTime(detail.visitAt) },
          ]}
        />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Propiedad</h3>
        <Facts
          items={[
            { label: 'Tipo de propiedad', value: PROPERTY_TYPE_LABELS[detail.propertyType] },
            { label: 'Dirección', value: text(detail.address) },
            { label: 'Superficie total', value: amount(detail.surfaceTotalM2, ' m²') },
            { label: 'Superficie cubierta', value: amount(detail.surfaceCoveredM2, ' m²') },
            { label: 'Ambientes', value: amount(detail.rooms) },
            { label: 'Dormitorios', value: amount(detail.bedrooms) },
            { label: 'Baños', value: amount(detail.bathrooms) },
            {
              label: 'Estado de conservación',
              value:
                detail.condition === undefined ? EMPTY_VALUE : CONDITION_LABELS[detail.condition],
            },
          ]}
        />
      </div>
    </div>
  );
}

/** Los datos de la ficha: se ven como etiqueta y valor y, si se puede, se editan con "Editar". */
export function AppraisalDataSection({
  detail,
  canEdit,
}: {
  readonly detail: AppraisalDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Datos"
      icon={ClipboardListIcon}
      canEdit={canEdit}
      view={<DataView detail={detail} />}
      form={(controls) => <AppraisalForm detail={detail} controls={controls} />}
    />
  );
}
