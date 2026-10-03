'use client';

import {
  CONSTRUCTION_STATUS_VALUES,
  DEVELOPMENT_TYPES,
  UpdateDevelopmentDetailsInputSchema,
  UpdateDevelopmentFeaturesInputSchema,
  UpdateDevelopmentGeneralInputSchema,
  UpdateDevelopmentLocationInputSchema,
  type DevelopmentDetail,
  type FeatureRow,
  type UpdateDevelopmentDetailsInput,
  type UpdateDevelopmentFeaturesInput,
  type UpdateDevelopmentGeneralInput,
  type UpdateDevelopmentLocationInput,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { Form } from '@norde/ui/components/form';
import {
  PagedMultiSelect,
  type ComboboxOption,
  type LoadComboboxPage,
} from '@norde/ui/components/paged-combobox';
import { Skeleton } from '@norde/ui/components/skeleton';
import { toast } from '@norde/ui/components/sonner';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { EMPTY_VALUE, formatDateOnly } from '../../../lib/format';
import { contractResolver } from '../../../lib/form';
import { loadClientOptions } from '../../clients/actions';
import { loadLocationOptions, loadTagOptions } from '../../properties/actions';
import { FEATURE_KIND_LABELS } from '../../properties/labels';
import {
  ChecklistField,
  SelectField,
  submitWith,
  SwitchField,
  TextareaField,
  TextField,
} from '../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import {
  changeDevelopmentTagsAction,
  updateDevelopmentDetailsAction,
  updateDevelopmentFeaturesAction,
  updateDevelopmentGeneralAction,
  updateDevelopmentLocationAction,
} from '../actions';
import { CONSTRUCTION_STATUS_LABELS, DEVELOPMENT_TYPE_LABELS } from '../labels';
import { GEOCODING_NOTICE, PickerField } from './development-sheet';

const LocationMapCanvas = dynamic(
  () =>
    import('../../properties/components/detail/location-map-canvas').then(
      (module) => module.LocationMapCanvas,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[50vh] min-h-[300px] w-full" /> },
);

const loadContacts: LoadComboboxPage = (search, page) => loadClientOptions(search, page);

function text(value: string | undefined): string {
  return value === undefined || value === '' ? EMPTY_VALUE : value;
}

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

/** La pestaña Detalles: una sección por caso de uso, cada una editable en el lugar. */
export function DevelopmentSections({
  detail,
  canEdit,
  catalog,
  catalogTruncated,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
  readonly catalog: readonly FeatureRow[];
  readonly catalogTruncated: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GeneralSection detail={detail} canEdit={canEdit} />
      <LocationSection detail={detail} canEdit={canEdit} />
      <DetailsSection detail={detail} canEdit={canEdit} />
      <div className="flex flex-col gap-4">
        <FeaturesSection
          detail={detail}
          canEdit={canEdit}
          catalog={catalog}
          truncated={catalogTruncated}
        />
        <TagsSection detail={detail} canEdit={canEdit} />
      </div>
    </div>
  );
}

// ---------- Datos generales ----------

function GeneralSection({
  detail,
  canEdit,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Datos generales"
      canEdit={canEdit}
      view={
        <Facts
          items={[
            { label: 'Nombre público', value: detail.name },
            {
              label: 'Tipo de desarrollo',
              value:
                detail.developmentType === undefined
                  ? EMPTY_VALUE
                  : DEVELOPMENT_TYPE_LABELS[detail.developmentType],
            },
            { label: 'Título para portales', value: detail.portalTitle },
            {
              label: 'Página web',
              value:
                detail.websiteUrl === undefined ? (
                  EMPTY_VALUE
                ) : (
                  <a
                    href={detail.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-700 hover:underline dark:text-primary-400"
                  >
                    {detail.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                ),
            },
            { label: 'Desarrollista (privado)', value: text(detail.developerName) },
            {
              label: 'Contacto comercial (privado)',
              value:
                detail.commercialContact === undefined
                  ? EMPTY_VALUE
                  : (detail.commercialContact.name ?? 'Contacto borrado'),
            },
            { label: 'Captador', value: text(detail.producer?.name) },
          ]}
        />
      }
      form={(controls) => <GeneralForm detail={detail} controls={controls} />}
    />
  );
}

function GeneralForm({
  detail,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<UpdateDevelopmentGeneralInput>({
    resolver: contractResolver(UpdateDevelopmentGeneralInputSchema),
    defaultValues: {
      developmentId: detail.id,
      name: detail.name,
      developmentType: detail.developmentType ?? 'building',
      portalTitle: detail.portalTitle,
      developerName: detail.developerName ?? '',
      commercialContactClientId: detail.commercialContact?.id,
      websiteUrl: detail.websiteUrl ?? '',
    },
  });
  const { control } = form;
  const contact = detail.commercialContact;
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updateDevelopmentGeneralAction(values));
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="name" label="Nombre público" />
          <SelectField
            control={control}
            name="developmentType"
            label="Tipo de desarrollo"
            options={DEVELOPMENT_TYPES}
            labels={DEVELOPMENT_TYPE_LABELS}
          />
          <TextField
            control={control}
            name="portalTitle"
            label="Título para portales"
            description="Vacío: el nombre."
          />
          <TextField
            control={control}
            name="websiteUrl"
            label="Página web"
            inputMode="url"
            placeholder="https://"
          />
          <TextField control={control} name="developerName" label="Desarrollista (privado)" />
          <PickerField
            control={control}
            name="commercialContactClientId"
            label="Contacto comercial (privado)"
            loadPage={loadContacts}
            placeholder="Buscar contacto"
            searchPlaceholder="Nombre, teléfono o email"
            clearLabel="Quitar contacto comercial"
            initial={
              contact === undefined
                ? undefined
                : { value: contact.id, label: contact.name ?? 'Contacto borrado' }
            }
          />
        </div>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Ubicación ----------

function LocationSection({
  detail,
  canEdit,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
}) {
  const place = detail.locationPath.map((level) => level.name).join(' › ');
  return (
    <InlineSection
      title="Ubicación"
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-4">
          <Facts
            items={[
              { label: 'Dirección (privada)', value: detail.privateAddress },
              { label: 'Dirección para publicar', value: detail.publishAddress },
              { label: 'Ubicación', value: text(place) },
              {
                label: 'Coordenadas',
                value:
                  detail.coordinates === undefined
                    ? 'Sin cargar'
                    : `${detail.coordinates.latitude.toString()}, ${detail.coordinates.longitude.toString()}`,
              },
            ]}
          />
          {detail.coordinates !== undefined && (
            <LocationMapCanvas
              latitude={detail.coordinates.latitude}
              longitude={detail.coordinates.longitude}
            />
          )}
        </div>
      }
      form={(controls) => <LocationForm detail={detail} controls={controls} />}
    />
  );
}

function LocationForm({
  detail,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<UpdateDevelopmentLocationInput>({
    resolver: contractResolver(UpdateDevelopmentLocationInputSchema),
    defaultValues: {
      developmentId: detail.id,
      privateAddress: detail.privateAddress,
      publishAddress: detail.publishAddress,
      locationId: detail.locationId ?? '',
      latitude: detail.coordinates?.latitude ?? '',
      longitude: detail.coordinates?.longitude ?? '',
    },
  });
  const { control } = form;
  const leaf = detail.locationPath.at(-1);
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(async () => {
            const result = await updateDevelopmentLocationAction(values);
            if (result.ok && result.geocoding !== undefined && result.geocoding !== 'unchanged') {
              const notice = GEOCODING_NOTICE[result.geocoding];
              if (notice !== undefined) toast.info(notice);
            }
            return result;
          }, 'Ubicación guardada.');
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="privateAddress" label="Dirección (privada)" />
          <TextField
            control={control}
            name="publishAddress"
            label="Dirección para publicar"
            description="Vacía: la calle con la altura redondeada."
          />
          <PickerField
            control={control}
            name="locationId"
            label="Barrio, localidad o provincia"
            loadPage={loadLocationOptions}
            placeholder="Buscar ubicación"
            searchPlaceholder="Ej. Palermo"
            initial={leaf === undefined ? undefined : { value: leaf.id, label: leaf.name }}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField control={control} name="latitude" label="Latitud" inputMode="decimal" />
            <TextField control={control} name="longitude" label="Longitud" inputMode="decimal" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Si cambiás la dirección y dejás las coordenadas vacías, se vuelven a buscar. Las unidades
          ya cargadas conservan su dirección.
        </p>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Obra, entrega y financiación ----------

function DetailsSection({
  detail,
  canEdit,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Obra, entrega y financiación"
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-4">
          <Facts
            items={[
              {
                label: 'Estado de obra',
                value:
                  detail.constructionStatus === undefined
                    ? EMPTY_VALUE
                    : CONSTRUCTION_STATUS_LABELS[detail.constructionStatus],
              },
              { label: 'Fecha de entrega', value: formatDateOnly(detail.deliveryDate) },
              { label: 'Financiado', value: yesNo(detail.isFinanced) },
              { label: 'Acepta permuta', value: yesNo(detail.acceptsSwap) },
              { label: 'Escritura inmediata', value: yesNo(detail.immediateDeed) },
              { label: 'Financiación', value: text(detail.financingDetails) },
            ]}
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">Descripción</p>
            <p className="text-sm whitespace-pre-line">{text(detail.description)}</p>
          </div>
        </div>
      }
      form={(controls) => <DetailsForm detail={detail} controls={controls} />}
    />
  );
}

function DetailsForm({
  detail,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<UpdateDevelopmentDetailsInput>({
    resolver: contractResolver(UpdateDevelopmentDetailsInputSchema),
    defaultValues: {
      developmentId: detail.id,
      constructionStatus: detail.constructionStatus,
      deliveryDate: detail.deliveryDate ?? '',
      description: detail.description,
      isFinanced: detail.isFinanced,
      acceptsSwap: detail.acceptsSwap,
      immediateDeed: detail.immediateDeed,
      financingDetails: detail.financingDetails ?? '',
    },
  });
  const { control } = form;
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updateDevelopmentDetailsAction(values));
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={control}
            name="constructionStatus"
            label="Estado de obra"
            options={CONSTRUCTION_STATUS_VALUES}
            labels={CONSTRUCTION_STATUS_LABELS}
            empty="Sin dato"
          />
          <TextField control={control} name="deliveryDate" label="Fecha de entrega" type="date" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <SwitchField control={control} name="isFinanced" label="Financiado" />
          <SwitchField control={control} name="acceptsSwap" label="Acepta permuta" />
          <SwitchField control={control} name="immediateDeed" label="Escritura inmediata" />
        </div>
        <TextareaField
          control={control}
          name="financingDetails"
          label="Financiación"
          description="Anticipo, cuotas, índice de ajuste."
          rows={3}
        />
        <TextareaField control={control} name="description" label="Descripción" rows={6} />
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Servicios y adicionales ----------

const FEATURE_KINDS = ['service', 'amenity'] as const;

function FeaturesSection({
  detail,
  canEdit,
  catalog,
  truncated,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
  readonly catalog: readonly FeatureRow[];
  readonly truncated: boolean;
}) {
  return (
    <InlineSection
      title="Servicios y adicionales"
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-3">
          {FEATURE_KINDS.map((kind) => {
            const items = detail.features.filter((feature) => feature.kind === kind);
            return (
              <div key={kind} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">{FEATURE_KIND_LABELS[kind]}</p>
                {items.length === 0 ? (
                  <p className="text-sm">{EMPTY_VALUE}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((feature) => (
                      <Badge key={feature.id} variant="secondary">
                        {feature.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Las unidades nuevas los heredan.</p>
        </div>
      }
      form={(controls) => (
        <FeaturesForm detail={detail} catalog={catalog} truncated={truncated} controls={controls} />
      )}
    />
  );
}

function FeaturesForm({
  detail,
  catalog,
  truncated,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly catalog: readonly FeatureRow[];
  readonly truncated: boolean;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<UpdateDevelopmentFeaturesInput>({
    resolver: contractResolver(UpdateDevelopmentFeaturesInputSchema),
    defaultValues: {
      developmentId: detail.id,
      featureIds: detail.features.map((feature) => feature.id),
    },
  });
  const hidden = detail.features.filter((feature) => !catalog.some((row) => row.id === feature.id));
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-5"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updateDevelopmentFeaturesAction(values), 'Catálogo guardado.');
        })}
      >
        {FEATURE_KINDS.map((kind) => (
          <ChecklistField
            key={kind}
            control={form.control}
            name="featureIds"
            label={FEATURE_KIND_LABELS[kind]}
            options={[
              ...catalog.filter((row) => row.kind === kind),
              ...hidden.filter((feature) => feature.kind === kind),
            ].map((row) => ({ value: row.id, label: row.name }))}
          />
        ))}
        {truncated && (
          <p className="text-xs text-muted-foreground">
            Se muestran los primeros 100 ítems de cada tipo del catálogo de Mi empresa.
          </p>
        )}
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Etiquetas ----------

function TagsSection({
  detail,
  canEdit,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Etiquetas"
      canEdit={canEdit}
      view={
        detail.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.groupName === undefined ? tag.name : `${tag.groupName}: ${tag.name}`}
              </Badge>
            ))}
          </div>
        )
      }
      form={(controls) => <TagsForm detail={detail} controls={controls} />}
    />
  );
}

function TagsForm({
  detail,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly controls: InlineFormControls;
}) {
  const [tags, setTags] = useState<readonly ComboboxOption[]>(
    detail.tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      ...(tag.groupName === undefined ? {} : { hint: tag.groupName }),
    })),
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        controls.save(
          () =>
            changeDevelopmentTagsAction({
              developmentId: detail.id,
              tagIds: tags.map((tag) => tag.value),
            }),
          'Etiquetas guardadas.',
        );
      }}
    >
      <PagedMultiSelect
        value={tags}
        onChange={setTags}
        loadPage={loadTagOptions}
        placeholder="Elegí las etiquetas"
        searchPlaceholder="Buscar etiqueta"
      />
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTags([]);
          }}
        >
          Quitar todas
        </Button>
        <InlineFormActions controls={controls} />
      </div>
    </form>
  );
}
